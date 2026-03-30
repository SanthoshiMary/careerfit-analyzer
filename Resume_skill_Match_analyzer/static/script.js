document.addEventListener("DOMContentLoaded", () => {
    const fadeElements = document.querySelectorAll(".fade-up");

    fadeElements.forEach((el, index) => {
        el.style.animationDelay = `${index * 0.15}s`;
    });
});