"""Build the extension archive from an explicit source allowlist."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parent.parent
package = json.loads((root / "package.json").read_text())
manifest = ET.fromstring((root / "scripts/extension.vsixmanifest").read_bytes())
namespace = {"v": "http://schemas.microsoft.com/developer/vsx-schema/2011"}
manifest.find("v:Metadata/v:Identity", namespace).set("Version", package["version"])
output = root / "dist" / ("push-for-peace-" + package["version"] + ".vsix")
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("extension.vsixmanifest", ET.tostring(manifest))
    archive.write(root / "scripts/content-types.xml", "[Content_Types].xml")
    for name in ("package.json", "index.js", "garmin.js", "updates.js", "guard.py", "README.md"):
        archive.write(root / name, "extension/" + name)
print(output)
