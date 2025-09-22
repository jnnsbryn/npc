document.querySelectorAll('.copy-address').forEach(item => {
    item.addEventListener('click', function() {
        const address = this.getAttribute('data-address');
        navigator.clipboard.writeText(address).then(() => {
            const originalText = this.textContent;
            this.textContent = 'Copied!';
            setTimeout(() => {
                this.textContent = originalText;
            }, 1200);
        }).catch(err => {
            console.error('Gagal menyalin: ', err);
        });
    });
});