// This function is called when the Google Translate API is ready.
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        autoDisplay: false, // Prevents the default widget from showing
        // We include languages here so the API knows what to support
        includedLanguages: 'en,hi,mr,gu,bn,ta,te', 
    }, 'google_translate_element');
}

// Function to trigger the translation
function triggerGoogleTranslation(lang) {
    // Get the hidden Google Translate select element
    const googleTranslateSelect = document.querySelector('.goog-te-combo');
    
    if (!googleTranslateSelect) {
        console.error("Google Translate select element not found.");
        return;
    }

    // Set its value to the desired language
    googleTranslateSelect.value = lang;

    // Dispatch a "change" event to trigger the translation
    const event = new Event('change');
    googleTranslateSelect.dispatchEvent(event);
}

// Add an event listener to our custom language selector
document.addEventListener('DOMContentLoaded', () => {
    const customSelector = document.getElementById('language-selector');
    if (customSelector) {
        customSelector.addEventListener('change', function() {
            triggerGoogleTranslation(this.value);
        });
    }
});