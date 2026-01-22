import fs from "fs";
import path from "path";

interface AfterPackContext {
    appOutDir: string;
}

export default async function removeLocales(context: AfterPackContext): Promise<void> {
    const localeDir = path.join(context.appOutDir, "locales");

    const files = await fs.promises.readdir(localeDir);
    if (!files || files.length === 0) return;

    for (const file of files) {
        if (!file.startsWith("en-US")) {
            await fs.promises.unlink(path.join(localeDir, file));
        }
    }
}
