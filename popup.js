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

async function sendToChatGPT(emailContent, formFields) {
    const apiKey = config.openAIKey;
   const apiUrl = 'https://api.openai.com/v1/chat/completions';

    const prompt = `
Given the following email content:

${emailContent}

Please fill out the following form fields based on the information in the email:

${formFields.map(field => `${field.labelText} (${field.type})`).join('\n')}

Provide your response in JSON format, with the field label as the key and the extracted value as the value. If a value cannot be determined, use null.
`;

    console.log("Sending prompt to ChatGPT:", prompt);

    try {
        console.log("Attempting to fetch from OpenAI API...");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that extracts information from emails to fill out forms."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7
            })
        });

        console.log("Received response from API. Status:", response.status);

        if (!response.ok) {
            console.error("API response not OK. Status:", response.status);
            const errorBody = await response.text();
            console.error("Error body:", errorBody);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Raw ChatGPT response:", JSON.stringify(data, null, 2));

        displayRawResponse(data);

        return data;
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
    console.log("Raw ChatGPT response:", rawResponse);

    if (!rawResponse || !rawResponse.choices || rawResponse.choices.length === 0) {
        console.error("Invalid or empty ChatGPT response");
        updateStatus("Error: Invalid response from ChatGPT");
        return;
    }

    const assistantMessage = rawResponse.choices[0].message.content;
    console.log("Assistant message:", assistantMessage);

    let extractedFields;
    try {
        extractedFields = JSON.parse(assistantMessage);
    } catch (error) {
        console.error("Failed to parse assistant message as JSON:", error);
        updateStatus("Error: Failed to parse ChatGPT response");
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