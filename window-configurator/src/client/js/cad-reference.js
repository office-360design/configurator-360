import { getWindowLocale, windowT } from './i18n.js';

export function createCadReferenceController({
    captureMode,
    isARMode,
    profileInput,
    getProfileSetId = () => profileInput?.value || '',
    button,
    modal,
    status,
    content,
    mainImage,
    thumbnails,
    subtitle,
}) {
    const imageCache = new Map();

    function readableScreenshotName(filename) {
        return filename
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function fetchImages(profileName) {
        if (imageCache.has(profileName)) {
            return imageCache.get(profileName);
        }

        try {
            const response = await fetch(
                `/api/cad-screenshots?profile=${encodeURIComponent(profileName)}`,
                { cache: 'no-store' }
            );

            if (response.ok) {
                const payload = await response.json();
                const images = Array.isArray(payload.images) ? payload.images : [];
                imageCache.set(profileName, images);
                return images;
            }
        } catch (error) {
            console.warn('API call failed, trying static images.json fallback:', error);
        }

        try {
            const response = await fetch(
                `cad_screenshots/${encodeURIComponent(profileName)}/images.json`
            );

            if (response.ok) {
                const images = await response.json();
                const normalizedImages = Array.isArray(images) ? images : [];
                imageCache.set(profileName, normalizedImages);
                return normalizedImages;
            }
        } catch (error) {
            console.error('Static images.json fallback failed:', error);
        }

        return [];
    }

    function selectImage(image, selectedButton) {
        if (!mainImage || !thumbnails) return;

        mainImage.src = image.url;
        mainImage.alt = windowT(getWindowLocale(), 'cad.imageAlt', { name: readableScreenshotName(image.filename) });

        thumbnails
            .querySelectorAll('.cad-reference-thumb')
            .forEach(item => item.classList.remove('active'));

        selectedButton?.classList.add('active');
    }

    function renderGallery(images) {
        if (!thumbnails) return;
        thumbnails.innerHTML = '';

        images.forEach((image, index) => {
            const galleryButton = document.createElement('button');
            galleryButton.type = 'button';
            galleryButton.className = 'cad-reference-thumb';

            const thumbnail = document.createElement('img');
            thumbnail.src = image.url;
            thumbnail.alt = '';

            const label = document.createElement('span');
            label.textContent = readableScreenshotName(image.filename);

            galleryButton.append(thumbnail, label);
            galleryButton.addEventListener('click', () => {
                selectImage(image, galleryButton);
            });

            thumbnails.appendChild(galleryButton);

            if (index === 0) {
                selectImage(image, galleryButton);
            }
        });
    }

    async function refreshAvailability() {
        if (captureMode || isARMode || !button || !profileInput) return;

        const profileName = getProfileSetId();
        button.disabled = true;
        button.title = windowT(getWindowLocale(), 'cad.checking');

        try {
            const images = await fetchImages(profileName);
            button.disabled = images.length === 0;
            button.title = images.length
                ? windowT(getWindowLocale(), 'cad.referenceCount', { count: images.length })
                : windowT(getWindowLocale(), 'cad.noReferences');
        } catch (error) {
            button.disabled = true;
            button.title = windowT(getWindowLocale(), 'cad.unavailable');
            console.warn('Could not load CAD reference screenshots:', error);
        }
    }

    async function openModal() {
        if (!modal || !profileInput || !status || !content) return;

        const profileName = getProfileSetId();
        modal.classList.add('open');

        if (subtitle) {
            subtitle.textContent = profileName;
        }

        status.style.display = 'block';
        status.textContent = windowT(getWindowLocale(), 'cad.loading');
        content.style.display = 'none';

        try {
            const images = await fetchImages(profileName);

            if (!images.length) {
                status.textContent = windowT(getWindowLocale(), 'cad.noneFound');
                return;
            }

            renderGallery(images);
            status.style.display = 'none';
            content.style.display = 'grid';
        } catch (error) {
            status.textContent = windowT(getWindowLocale(), 'cad.loadFailed', { message: error.message });
        }
    }

    function closeModal() {
        modal?.classList.remove('open');
    }

    function handleLocaleChange() {
        if (modal?.classList.contains('open') && status?.style.display !== 'none') {
            status.textContent = windowT(getWindowLocale(), 'cad.loading');
        }
        void refreshAvailability();
    }

    globalThis.window?.addEventListener('window-locale-applied', handleLocaleChange);

    function destroy() {
        globalThis.window?.removeEventListener('window-locale-applied', handleLocaleChange);
    }

    return {
        refreshAvailability,
        openModal,
        closeModal,
        destroy,
    };
}
