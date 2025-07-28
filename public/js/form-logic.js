// Handle dynamic fields based on age
function handleAgeChange() {
    const ageInput = document.getElementById('age');
    const age = ageInput.value ? parseInt(ageInput.value) : 0;
    
    const personContactInput = document.getElementById('personContactNumber');
    const contactHelperText = document.getElementById('contact-helper-text');
    const guardianSection = document.getElementById('guardian-section');
    const guardianInputs = guardianSection.querySelectorAll('input, select');

    // Toggle guardian fields for minors
    if (age > 0 && age < 18) {
        guardianSection.style.display = 'block';
        guardianInputs.forEach(input => input.required = true);
    } else {
        guardianSection.style.display = 'none';
        guardianInputs.forEach(input => input.required = false);
    }
    
    // Toggle required attribute for person's contact number
    if (age >= 18) {
        personContactInput.required = true;
        contactHelperText.style.color = '#c00'; // Make helper text red to indicate importance
    } else {
        personContactInput.required = false;
         contactHelperText.style.color = '#777'; // Reset color
    }
}

// Add event listeners once the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Form validation for image count
    const findPersonForm = document.getElementById('find-person-form');
    if (findPersonForm) {
        findPersonForm.addEventListener('submit', function(event) {
            const imageInput = document.getElementById('images');
            if (imageInput.files.length < 3) {
                alert('Please upload a minimum of 3 images.');
                event.preventDefault();
            }
            if (imageInput.files.length > 7) {
                alert('You can upload a maximum of 7 images.');
                event.preventDefault();
            }
        });
    }

    // Initial check on page load in case of form re-population
    handleAgeChange();
});