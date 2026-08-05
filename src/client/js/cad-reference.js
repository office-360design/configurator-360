export function createCadReferenceController({
    captureMode,
    isARMode,
    profileInput,
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
        mainImage.alt = `CAD section reference: ${readableScreenshotName(image.filename)}`;

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

        const profileName = profileInput.value;
        button.disabled = true;
        button.title = 'Checking CAD references…';

        try {
            const images = await fetchImages(profileName);
            button.disabled = images.length === 0;
            button.title = images.length
                ? `CAD Section Reference (${images.length})`
                : 'No CAD references';
        } catch (error) {
            button.disabled = true;
            button.title = 'CAD references unavailable';
            console.warn('Could not load CAD reference screenshots:', error);
        }
    }

    async function openModal() {
        if (!modal || !profileInput || !status || !content) return;

        const profileName = profileInput.value;
        modal.classList.add('open');

        if (subtitle) {
            subtitle.textContent = profileName;
        }

        status.style.display = 'block';
        status.textContent = 'Loading reference screenshots…';
        content.style.display = 'none';

        try {
            const images = await fetchImages(profileName);

            if (!images.length) {
                status.textContent = 'No screenshots were found for this CAD profile.';
                return;
            }

            renderGallery(images);
            status.style.display = 'none';
            content.style.display = 'grid';
        } catch (error) {
            status.textContent = `Reference screenshots could not be loaded: ${error.message}`;
        }
    }

    function closeModal() {
        modal?.classList.remove('open');
    }

    return {
        refreshAvailability,
        openModal,
        closeModal,
    };
}
