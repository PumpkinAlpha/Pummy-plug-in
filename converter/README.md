# Optional PowerPoint conversion

Pummy opens original PPT/PPTX directly in the browser. No converter is required. An optional PDF exported by PowerPoint can supply exact visuals. Export all slides, including hidden slides, in their original order. PDFs must match the original slide count and aspect ratio; Pummy keeps both files unchanged.

For automatic conversion, deploy this container on an existing container host behind HTTPS. The Site runs in a Cloudflare Worker and cannot execute LibreOffice. No hosting account, endpoint, credentials, or paid resource is created by this repository.

Build from the repository root:

```sh
docker build -f converter/Dockerfile -t pummy-converter .
```

Supply a randomly generated secret of at least 32 characters through the container host's secret manager as `PRESENTATION_CONVERTER_TOKEN`. Never include it in the image, source, or browser. Run as the supplied unprivileged user. The HTTP listener is port 8080; terminate HTTPS at the host. Allow inbound traffic only through the authenticated endpoint and restrict outbound network access for the document processor. Keep the image and LibreOffice packages updated.

Configure the existing Site with native Sites environment tools:

- `PRESENTATION_CONVERTER_URL`: the final HTTPS `/convert` endpoint (no redirect).
- `PRESENTATION_CONVERTER_TOKEN`: the same secret, marked secret.

The authenticated `GET /health` endpoint checks the service and LibreOffice executable. `POST /convert` accepts PPT/PPTX, rejects other formats and macro-bearing files, bounds streamed input to 16 MiB, and bounds output to 24 MiB. Jobs have independent temporary directories and profiles, macro execution disabled, and a 90-second process deadline. Four requests can wait/read; native rendering runs one job at a time. Requests waiting more than 30 seconds return 503. The Site rejects mismatched slide counts/aspect ratios and reuses successful conversion receipts after a lost response.

Validate a real lecture deck after provisioning. LibreOffice may substitute fonts or render complex PowerPoint content differently; the companion PDF exported by PowerPoint remains the exact-visuals option. The Docker image has not been built in the current audit environment because Docker and LibreOffice are unavailable. Request/response bounds, queue admission, authentication and mocked conversion integration are automated tests, not proof of native rendering.

References: [LibreOffice PDF export parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html), [LibreOffice security updates](https://www.libreoffice.org/security/).
