import { App, Plugin, PluginSettingTab, SettingDefinitionItem } from "obsidian";

export interface IncludeSettings { shorthand: string }
export const DEFAULT_SETTINGS: IncludeSettings = { shorthand: "::" };

export function shorthandError(value: string): string | undefined {
  if (/\s/u.test(value) || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "Use a shorthand without spaces or line breaks.";
  if (value.length > 32) return "Use at most 32 characters.";
}

export function readSettings(value: unknown): IncludeSettings {
  const shorthand = value && typeof value === "object" && "shorthand" in value ? value.shorthand : undefined;
  return { shorthand: typeof shorthand === "string" && !shorthandError(shorthand) ? shorthand : DEFAULT_SETTINGS.shorthand };
}

interface SettingsOwner extends Plugin {
  settings: IncludeSettings;
  setShorthand(value: string): Promise<void>;
}

export class IncludeSettingsTab extends PluginSettingTab {
  constructor(app: App, private owner: SettingsOwner) { super(app, owner); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{ name: "Include shorthand", desc: "Type this shorthand to search Markdown notes and insert a GitLab include. Default: ::. Leave empty to disable.",
      control: { type: "text", key: "shorthand", defaultValue: "::", placeholder: "::", validate: shorthandError } }];
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "shorthand" && typeof value === "string" && !shorthandError(value)) await this.owner.setShorthand(value);
  }
}
