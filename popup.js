import config from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    const processButton = document.getElementById('processButton');
    const fillFormButton = document.getElementById('fillFormButton');

    if (processButton) {
        processButton.addEventListener('click', processEmailAndExtractFields);
        console.log('Event listener added to processButton');
    } else {
        console.error('processButton not found in the DOM');
    }

    if (fillFormButton) {
        fillFormButton.addEventListener('click', fillFormWithReviewedFields);
        console.log('Event listener added to fillFormButton');
    } else {
        console.error('fillFormButton not found in the DOM');
    }

    const extractOptionsButton = document.getElementById('extractOptionsButton');
    if (extractOptionsButton) {
        extractOptionsButton.addEventListener('click', extractAndDisplayOptions);
    } else {
        console.error('extractOptionsButton not found in the DOM');
    }
});

async function processEmailAndExtractFields() {
    console.log('processEmailAndExtractFields function called');
    const emailContent = document.getElementById('emailContent').value.trim();
    if (!emailContent) {
        updateStatus('Please paste email content first.');
        return;
    }

    updateStatus('Processing...');

    try {
        console.log("Getting form fields...");
        const formFields = await getFormFields();
        console.log("Form fields:", formFields);

        console.log("Sending to ChatGPT...");
        const rawResponse = await sendToChatGPT(emailContent, formFields);
        console.log("Raw ChatGPT response:", rawResponse);

        displayExtractedFields(formFields, rawResponse);
    } catch (error) {
        console.error("Error in processEmailAndExtractFields:", error);
        updateStatus(`Error: ${error.message}`);
    }
}

function getFormFields() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: findAllFieldsWithLabels,
            }, (results) => {
                if (chrome.runtime.lastError) {
                    console.error("Error in getFormFields:", chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log("Fields found:", results[0].result);
                    resolve(results[0].result);
                }
            });
        });
    });
}

function findAllFieldsWithLabels() {
    const allFields = document.querySelectorAll('input[role="combobox"], input[type="text"], input[type="number"], input[type="checkbox"], textarea, input[aria-autocomplete="list"], input[role="spinbutton"], input[type="date"], input[type="time"]');
    const relevantSelectors = [];

    allFields.forEach((field, index) => {
        const container = field.closest('div');
        let labelText = '';

        const id = field.id;
        if (id) {
            const labelElement = document.querySelector(`label[for="${id}"]`);
            if (labelElement) {
                labelText = labelElement.innerText;
            }
        }

        if (!labelText) {
            const labelElement = container.querySelector('label');
            if (labelElement) {
                labelText = labelElement.innerText.trim();
            } else if (field.placeholder) {
                labelText = field.placeholder.trim();
            } else if (field.getAttribute('aria-label')) {
                labelText = field.getAttribute('aria-label').trim();
            } else {
                const parentDiv = field.closest('div');
                if (parentDiv) {
                    const previousText = parentDiv.previousElementSibling;
                    if (previousText && previousText.innerText) {
                        labelText = previousText.innerText.trim();
                    }
                }
            }
        }

        if (!labelText) {
            labelText = `Field ${index + 1}`;
        }

        if (container) {
            relevantSelectors.push({
                input: field,
                container: container,
                labelText: labelText,
                type: field.type || field.tagName.toLowerCase(),
                index: index
            });
        }
    });

    return relevantSelectors;
}

function extractDropdownOptions() {
    const dropdowns = document.querySelectorAll('input[role="combobox"], .sc-guJBdh.sc-fTFjTM.cxFpzr');
    const extractedOptions = {};

    dropdowns.forEach((dropdown, index) => {
        let dropdownOpened = false;
        const dropdownName = dropdown.id || dropdown.name || `Dropdown ${index + 1}`;

        // Focus on the input field or parent element
        if (dropdown.tagName.toLowerCase() === 'input') {
            dropdown.focus();
        } else {
            const inputField = dropdown.closest('div').querySelector('input');
            if (inputField) {
                inputField.focus();
            }
        }

        // Simulate events to open the dropdown
        const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
        events.forEach(eventType => {
            dropdown.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
        });

        dropdownOpened = true;
        console.log(`${dropdownName} should be triggered`);

        // Extract options after a short delay to allow for dropdown to open
        setTimeout(() => {
            const optionElements = document.querySelectorAll('[id^="react-select-"][id$="-option"], .css-1jpqh9-option, [class*="option"], .css-1n7v3ny');
            
            if (optionElements.length > 0) {
                extractedOptions[dropdownName] = Array.from(optionElements).map(el => el.textContent.trim());
                console.log(`Options extracted for ${dropdownName}:`, extractedOptions[dropdownName]);
            } else {
                console.log(`No options found for ${dropdownName}`);
            }

            // Close the dropdown by clicking outside
            document.body.click();
        }, 500);
    });

    // Return the extracted options after all dropdowns have been processed
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(extractedOptions);
        }, dropdowns.length * 600); // Wait a bit longer than the individual dropdown timeouts
    });
}

function extractAndDisplayOptions() {
    updateStatus('Extracting options from dropdowns...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: extractDropdownOptions
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error("Error in extractAndDisplayOptions:", chrome.runtime.lastError);
                updateStatus(`Error: ${chrome.runtime.lastError.message}`);
            } else {
                const extractedOptions = results[0].result;
                displayDropdownOptions(extractedOptions);
            }
        });
    });
}

function displayDropdownOptions(dropdownOptions) {
    const optionsContainer = document.getElementById('optionsContainer');
    const dropdownOptionsSection = document.getElementById('dropdownOptionsSection');
    
    if (!optionsContainer || !dropdownOptionsSection) {
        console.error("optionsContainer or dropdownOptionsSection not found in the DOM");
        return;
    }
    
    optionsContainer.innerHTML = '';

    if (Object.keys(dropdownOptions).length === 0) {
        optionsContainer.innerHTML = '<p>No dropdown options found.</p>';
    } else {
        for (const [label, options] of Object.entries(dropdownOptions)) {
            const dropdownSection = document.createElement('div');
            dropdownSection.className = 'dropdown-section';

            const labelElement = document.createElement('h3');
            labelElement.textContent = label;
            dropdownSection.appendChild(labelElement);

            const optionsList = document.createElement('ul');
            options.forEach(option => {
                const listItem = document.createElement('li');
                listItem.textContent = option;
                optionsList.appendChild(listItem);
            });
            dropdownSection.appendChild(optionsList);

            optionsContainer.appendChild(dropdownSection);
        }
    }

    dropdownOptionsSection.style.display = 'block';
    updateStatus('Dropdown options extracted successfully!');
}

async function sendToChatGPT(emailContent, formFields) {
    const apiKey = config.openAIKey;
    const baseUrl = 'https://api.openai.com/v1';
    const assistantId = 'asst_auGRoJqaRVySWahymKlPW90Q'; // Replace with your actual Assistant ID

    const prompt = `
Given the following email content:

${emailContent}

Please fill out the following form fields based on the information in the email:

${formFields.map(field => `${field.labelText} (${field.type})`).join('\n')}

Provide your response in JSON format, with the field label as the key and the extracted value as the value. If a value cannot be determined, use null.
`;

    console.log("Sending prompt to Assistant:", prompt);

    try {
        // Step 1: Create a new thread
        const threadResponse = await fetch(`${baseUrl}/threads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({})
        });

        if (!threadResponse.ok) {
            const errorBody = await threadResponse.text();
            console.error("Thread creation error:", errorBody);
            throw new Error(`HTTP error! status: ${threadResponse.status}, body: ${errorBody}`);
        }

        const threadData = await threadResponse.json();
        const threadId = threadData.id;

        // Step 2: Add a message to the thread
        const messageResponse = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ role: 'user', content: prompt })
        });

        if (!messageResponse.ok) {
            const errorBody = await messageResponse.text();
            console.error("Message creation error:", errorBody);
            throw new Error(`HTTP error! status: ${messageResponse.status}, body: ${errorBody}`);
        }

        // Step 3: Run the assistant
        const runResponse = await fetch(`${baseUrl}/threads/${threadId}/runs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ assistant_id: assistantId })
        });

        if (!runResponse.ok) {
            const errorBody = await runResponse.text();
            console.error("Run creation error:", errorBody);
            throw new Error(`HTTP error! status: ${runResponse.status}, body: ${errorBody}`);
        }

        const runData = await runResponse.json();
        const runId = runData.id;

        // Step 4: Wait for the run to complete
        let runStatus;
        do {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            const statusResponse = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            });
            if (!statusResponse.ok) {
                const errorBody = await statusResponse.text();
                console.error("Run status check error:", errorBody);
                throw new Error(`HTTP error! status: ${statusResponse.status}, body: ${errorBody}`);
            }
            const statusData = await statusResponse.json();
            runStatus = statusData.status;
        } while (runStatus === 'in_progress');

        if (runStatus !== 'completed') {
            throw new Error(`Run failed with status: ${runStatus}`);
        }

        // Step 5: Retrieve the messages
        const messagesResponse = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'OpenAI-Beta': 'assistants=v2'
            }
        });

        if (!messagesResponse.ok) {
            const errorBody = await messagesResponse.text();
            console.error("Messages retrieval error:", errorBody);
            throw new Error(`HTTP error! status: ${messagesResponse.status}, body: ${errorBody}`);
        }

        const messagesData = await messagesResponse.json();
        const assistantMessage = messagesData.data.find(msg => msg.role === 'assistant');

        if (!assistantMessage) {
            throw new Error('No assistant message found');
        }

        console.log("Raw Assistant response:", assistantMessage);

        displayRawResponse(assistantMessage);

        return assistantMessage;
    } catch (error) {
        console.error("Error in sendToChatGPT:", error);
        throw error;
    }
}

function displayRawResponse(response) {
    const rawResponseElement = document.getElementById('rawResponse');
    if (rawResponseElement) {
        rawResponseElement.textContent = JSON.stringify(response, null, 2);
    } else {
        console.error("rawResponse element not found in the DOM");
    }
}

function displayExtractedFields(formFields, rawResponse) {
    console.log("Displaying extracted fields");
    console.log("Form fields:", formFields);
    console.log("Raw Assistant response:", rawResponse);

    if (!rawResponse || !rawResponse.content || rawResponse.content.length === 0) {
        console.error("Invalid or empty Assistant response");
        updateStatus("Error: Invalid response from Assistant");
        return;
    }

    const assistantMessage = rawResponse.content[0].text.value;
    console.log("Assistant message:", assistantMessage);

    let extractedFields;
    try {
        extractedFields = JSON.parse(assistantMessage);
    } catch (error) {
        console.error("Failed to parse assistant message as JSON:", error);
        updateStatus("Error: Failed to parse Assistant response");
        return;
    }

    console.log("Parsed extracted fields:", extractedFields);

    const fieldsContainer = document.getElementById('fieldsContainer');
    if (!fieldsContainer) {
        console.error("fieldsContainer not found in the DOM");
        return;
    }
    fieldsContainer.innerHTML = '';

    formFields.forEach((field, index) => {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'field-row';

        const label = document.createElement('label');
        label.textContent = `${field.labelText}:`;
        label.setAttribute('for', `field_${index}`);

        const input = document.createElement('input');
        input.type = field.type === 'checkbox' ? 'checkbox' : 'text';
        input.id = `field_${index}`;
        input.name = `field_${index}`;
        
        const extractedValue = extractedFields[field.labelText];
        console.log(`Field ${index}:`, field.labelText, "Extracted value:", extractedValue);

        if (field.type === 'checkbox') {
            input.checked = extractedValue === true || String(extractedValue).toLowerCase() === 'true';
        } else {
            input.value = extractedValue !== null && extractedValue !== undefined ? String(extractedValue) : '';
        }

        fieldRow.appendChild(label);
        fieldRow.appendChild(input);
        fieldsContainer.appendChild(fieldRow);
    });

    const extractedFieldsElement = document.getElementById('extractedFields');
    if (extractedFieldsElement) {
        extractedFieldsElement.style.display = 'block';
    } else {
        console.error("extractedFields element not found in the DOM");
    }

    updateStatus('Fields extracted. Please review and edit if necessary.');
}

function getReviewedFields() {
    const reviewedFields = [];
    const fieldInputs = document.querySelectorAll('#fieldsContainer input');
    fieldInputs.forEach(input => {
        if (input.type === 'checkbox') {
            reviewedFields.push(input.checked ? 'true' : 'false');
        } else {
            reviewedFields.push(input.value);
        }
    });
    console.log("Reviewed fields:", reviewedFields);
    return reviewedFields;
}

function fillFormWithReviewedFields() {
    console.log('fillFormWithReviewedFields function called');
    const reviewedFields = getReviewedFields();
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: interactWithFields,
            args: [reviewedFields]
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error("Error in fillFormWithReviewedFields:", chrome.runtime.lastError);
                updateStatus(`Error: ${chrome.runtime.lastError.message}`);
            } else {
                console.log("Form filled successfully");
                updateStatus('Form filled successfully!');
            }
        });
    });
}

function interactWithFields(inputs) {
    function findAllFieldsWithLabels() {
        const allFields = document.querySelectorAll('input[role="combobox"], input[type="text"], input[type="number"], input[type="checkbox"], textarea, input[aria-autocomplete="list"], input[role="spinbutton"], input[type="date"], input[type="time"]');
        const relevantSelectors = [];

        allFields.forEach((field, index) => {
            const container = field.closest('div');
            relevantSelectors.push({
                input: field,
                container: container,
                type: field.type || field.tagName.toLowerCase(),
                index: index
            });
        });

        return relevantSelectors;
    }

    console.log("Interacting with fields. Inputs:", inputs);
    const relevantSelectors = findAllFieldsWithLabels();
    console.log("Relevant selectors:", relevantSelectors);

    if (relevantSelectors.length > 0) {
        relevantSelectors.forEach((selector, index) => {
            const { input, container } = selector;
            if (input && inputs[index] !== undefined) {
                container.click();  // Click the container to focus on the input
                setTimeout(() => {
                    const valueToType = inputs[index];
                    if (input.type === 'checkbox') {
                        input.checked = valueToType.toLowerCase() === 'true';
                    } else {
                        input.value = valueToType;
                    }
                    const event = new Event('input', { bubbles: true });
                    input.dispatchEvent(event);
                    console.log(`Typed "${valueToType}" into field ${index}.`);

                    if (input.type !== 'checkbox') {
                        setTimeout(() => {
                            const optionElement = document.querySelector('.css-1jpqh9-option, [class*="option"], .css-1n7v3ny');
                            if (optionElement) {
                                optionElement.click();
                                console.log(`Clicked option element for field ${index}.`);
                            } else {
                                console.log(`No option element found to click for field ${index}.`);
                            }
                        }, 1000);
                    }
                }, 500);
            }
        });
    } else {
        console.error('No relevant selectors found.');
    }
}


function updateStatus(message) {
    console.log("Status update:", message);
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    } else {
        console.error("Status element not found in the DOM");
    }
}
