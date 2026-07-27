const fs = require('fs');
const path = require('path');

const CAD_SCREENSHOTS_DIR = path.join(__dirname, 'cad_screenshots');
if (fs.existsSync(CAD_SCREENSHOTS_DIR)) {
    const profiles = fs.readdirSync(CAD_SCREENSHOTS_DIR);
    profiles.forEach(profile => {
        const dir = path.join(CAD_SCREENSHOTS_DIR, profile);
        if (fs.statSync(dir).isDirectory()) {
            const files = fs.readdirSync(dir);
            const images = files
                .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
                })
                .map(filename => ({
                    filename,
                    url: `cad_screenshots/${profile}/${filename}`
                }));
            fs.writeFileSync(path.join(dir, 'images.json'), JSON.stringify(images, null, 2), 'utf-8');
            console.log(`Generated images.json for ${profile}`);
        }
    });
} else {
    console.error("Error: cad_screenshots directory not found.");
}
