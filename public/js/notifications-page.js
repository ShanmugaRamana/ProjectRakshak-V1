document.addEventListener('DOMContentLoaded', () => {
    const actionButtons = document.querySelectorAll('.notification-actions button');

    actionButtons.forEach(button => {
        button.addEventListener('click', handleAction);
    });

    async function handleAction(event) {
        const button = event.target;
        const card = button.closest('.notification-card');
        const personId = button.dataset.id;
        const notificationId = card.id.split('-')[1]; // Get ID from "notification-..."
        const action = button.classList.contains('btn-accept') ? 'accept' : 'research';
        const actionsDiv = card.querySelector('.notification-actions');
        
        actionsDiv.innerHTML = `<p style="color: #0056b3;">Processing...</p>`;

        try {
            const response = await fetch(`/api/person/${personId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // NEW: Send notificationId along with the action
                body: JSON.stringify({ action, notificationId }) 
            });

            if (response.ok) {
                // SUCCESS: For both actions, we give feedback and remove the card.
                const result = await response.json();
                actionsDiv.innerHTML = `<p style="color: ${action === 'accept' ? '#28a745' : '#6c757d'}; font-weight: bold;">${result.message}</p>`;
                
                // Remove the card from the view after a short delay
                setTimeout(() => {
                    card.style.transition = 'opacity 0.5s ease';
                    card.style.opacity = '0';
                    setTimeout(() => card.remove(), 500);
                }, 2000);

            } else {
                const result = await response.json();
                actionsDiv.innerHTML = `<p style="color: #dc3545;">Error: ${result.message}</p>`;
            }
        } catch (err) {
            console.error(`Error during ${action}:`, err);
            actionsDiv.innerHTML = `<p style="color: #dc3545;">A client-side error occurred.</p>`;
        }
    }
});