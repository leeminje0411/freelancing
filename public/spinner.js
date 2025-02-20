function showSpinner() {
    document.getElementById('spinnerOverlay').style.display = 'flex';
}

function hideSpinner() {
    document.getElementById('spinnerOverlay').style.display = 'none';
}
document.addEventListener('DOMContentLoaded', () => {
    showSpinner();
    setTimeout(() => {
        hideSpinner();
    }, 1300);
});



