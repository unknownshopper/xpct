document.addEventListener('DOMContentLoaded', () => {
    const navMain = document.querySelector('.nav-main');
    if (!navMain) return;

    // Asegurar que todos los dropdowns inicien colapsados
    navMain.querySelectorAll('.nav-item-has-dropdown').forEach(el => {
        el.classList.remove('is-open');
    });

    navMain.addEventListener('click', (event) => {
        const trigger = event.target.closest('.nav-item-has-dropdown > a');
        if (!trigger) return;

        event.preventDefault();

        const item = trigger.parentElement;

        const yaAbierto = item.classList.contains('is-open');

        // Cerrar todos
        navMain.querySelectorAll('.nav-item-has-dropdown.is-open').forEach(el => {
            el.classList.remove('is-open');
        });

        // Si no estaba abierto, abrir solo este
        if (!yaAbierto) {
            item.classList.add('is-open');
        }
    });
});
