document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const contentPanels = document.querySelectorAll('.content-panel');
    const showGroundStaffFormBtn = document.getElementById('show-ground-staff-form');
    const groundStaffForm = document.getElementById('ground-staff-form-container');

    // Tab switching logic
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update active link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Show/hide content panels
            const targetId = link.getAttribute('data-target');
            contentPanels.forEach(panel => {
                if (panel.id === targetId) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });
            window.location.hash = link.hash;
        });
    });

    // Logic to show form when "Ground Staff" is clicked
    if (showGroundStaffFormBtn) {
        showGroundStaffFormBtn.addEventListener('click', () => {
            groundStaffForm.style.display = 'block';
        });
    }

    // Check URL hash on page load to open the correct tab
    const currentHash = window.location.hash.substring(1);
    if (currentHash) {
        const targetLink = document.querySelector(`.nav-link[href="#${currentHash}"]`);
        if (targetLink) {
            targetLink.click();
        }
    }
});