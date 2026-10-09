# NOVA//VOID portfolio

A no-build static portfolio made for GitHub Pages. Upload the whole repository; do not upload `editor.html` if you do not want the local editor public.

## Publish on GitHub Pages

1. Create a GitHub repository and upload these files.
2. In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. Save. GitHub provides the live URL after deployment. The included `.nojekyll` makes GitHub serve the static files exactly as authored.

## Change projects

1. Open `editor.html` locally in a browser (it never needs hosting).
2. Update artist details, add/edit/reorder project cards, tags, media paths and descriptions.
3. Click **Export content-data.js** and replace `content/content-data.js` in the site with the download.
4. Add your images/video poster images under `assets/`, commit, and republish.

`rank` is the source of truth: it determines both the homepage featured pieces and the unfiltered Work order. Lower ranks appear first. Projects can hold several tags. For video, use a lightweight poster image in `media` and provide its video file path or URL in `videoUrl`; the gallery deliberately does not preload full video files, and loads a player only when a visitor opens that project.

Replace `assets/portrait.svg` with your portrait and update the `<img>` path in `about.html`. Replace the placeholder SVGs with your own raster images, WebP posters, or video poster files while retaining each project’s `ratio`.
