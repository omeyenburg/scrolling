// Copyright (C) 2025 Oskar Meyenburg
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";


interface ScrollingPluginSettings {
    mouse_scroll_enabled: boolean;
    mouse_scroll_speed: number;
    mouse_scroll_smoothness: number;
    mouse_scroll_invert: boolean;
    center_cursor_enabled: boolean;
    center_cursor_editing_distance: number;
    center_cursor_moving_distance: number;
    center_cursor_editing_smoothness: number;
    center_cursor_moving_smoothness: number;
    center_cursor_enable_mouse: boolean;
    scrollbar_global: boolean;
    scrollbar_visibility: string;
    scrollbar_width: number;
}


const DEFAULT_SETTINGS: ScrollingPluginSettings = {
    mouse_scroll_enabled: true,
    mouse_scroll_speed: 1,
    mouse_scroll_smoothness: 1,
    mouse_scroll_invert: false,
    center_cursor_enabled: true,
    center_cursor_editing_distance: 25,
    center_cursor_moving_distance: 25,
    center_cursor_editing_smoothness: 1,
    center_cursor_moving_smoothness: 1,
    center_cursor_enable_mouse: false,
    scrollbar_global: false,
    scrollbar_visibility: "show",
    scrollbar_width: 5,
}


export default class ScrollingPlugin extends Plugin {
    settings: ScrollingPluginSettings;

    editing: boolean;
    mousedown: boolean;
    mouseup: boolean;

    last_selectionchange: number;
    smoothscroll_timeout: any;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ScrollingSettingTab(this.app, this));

        // Callbacks for markdown changes and cursor movements
        // Will be automatically deleted on reload
        this.registerEvent(this.app.workspace.on("editor-change", (editor) => this.edit_callback(editor)));

        // this is invoked on mouse down (selection start), editing as well, wrapping/layout changes due to stuff expanding while hovering on a line with cursor
        this.registerDomEvent(document, "selectionchange", () => this.selectionchange_callback());
        this.registerDomEvent(document, "mousedown", () => this.mousedown_callback());
        this.registerDomEvent(document, "mouseup", () => this.mouseup_callback());

        this.apply_scrollbar_hide();
        console.log("ScrollingPlugin loaded");
    }

    async onunload() {
        this.remove_scrollbar_hide();
        console.log("ScrollingPlugin unloaded");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    edit_callback(editor: Editor) {
        this.editing = true;
        this.scroll(editor);
    }

    mousedown_callback() {
        this.mousedown = true;
    }

    mouseup_callback() {
        this.mousedown = false;
        this.mouseup = true;
    }

    selectionchange_callback() {
        // selectionchange will also be invoked with mouse actions; this prevents further actions.
        // maybe expose as a setting.
        if (this.mousedown) return;
        if (this.mouseup) {
            this.mouseup = false;
            return;
        }

        setTimeout(() => {
            if (this.mousedown) return;

            if (this.editing) {
                this.editing = false;
                return;
            }

            // const editor = this.app.workspace.activeEditor?.editor;
            const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor
            if (!editor) return;

            // return if text got selected; we do not want to interfere with that
            if (editor.somethingSelected()) return;

            this.scroll(editor);
        }, 10);
    }

    scroll(editor: Editor) {
        const editor_view = editor.cm;

        // cursor position on screen in pixels
        const cursor = editor_view.coordsAtPos(editor_view.state.selection.main.head);
        if (!cursor) return;

        const current_scroll_y = editor.getScrollInfo().top;
        const cursor_y = cursor.top;
        const scrollInfo = editor_view.scrollDOM.getBoundingClientRect();
        const center = (scrollInfo.top + scrollInfo.bottom) / 2
        const center_offset = cursor_y - center;

        clearTimeout(this.smoothscroll_timeout);

        const time = 5;
        let steps = Math.round(1 + 4 * this.settings.center_cursor_editing_smoothness);
        this.smoothscroll(editor, current_scroll_y + center_offset, center_offset / steps, time, steps);
    }

    smoothscroll(editor: Editor, dest: number, step_size: number, time: number, step: number) {
        if (!step) return;
        const move_to = dest - step_size * (step - 1);
        editor.scrollTo(null, move_to);
        this.smoothscroll_timeout = setTimeout(() => this.smoothscroll(editor, dest, step_size, time, step - 1), time);
    }

    apply_scrollbar_hide() {
        console.log("invoked")
        // Updates the scrollbar hide style according to the current setting value
        if (this.settings.scrollbar_visibility === "show") {
            this.remove_scrollbar_hide()
            console.log("call remove")
            return;
        }
        console.log("dont call remove")

        if (document.getElementById("scrolling-scrollbar-style") !== null) return;
        console.log("create new")

        const style = document.createElement('style');
        style.id = 'scrolling-scrollbar-style';
        style.textContent = `
            /* Hide scrollbar in the editor pane */
            .markdown-source-view,
            .cm-scroller {
              scrollbar-width: none !important; /* Firefox */
              -ms-overflow-style: none !important; /* IE 10+ */
            }
            .markdown-source-view::-webkit-scrollbar,
            .cm-scroller::-webkit-scrollbar {
              display: none !important; /* Chrome, Safari, Opera */
            }
        `;
        document.head.appendChild(style);
    }

    remove_scrollbar_hide() {
        document.getElementById("scrolling-scrollbar-style")?.remove();
    }
}


class ScrollingSettingTab extends PluginSettingTab {
    plugin: ScrollingPlugin;

    constructor(app: App, plugin: ScrollingPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const containerEl = this.containerEl;
        containerEl.empty();

        // Mouse scrolling settings
        new Setting(containerEl)
            .setName("Mouse scrolling")
            .setHeading();

        new Setting(containerEl)
            .setName("Enabled")
            .setDesc("Whether mouse scrolling settings should be applied.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.mouse_scroll_enabled)
                .onChange(async (value) => {
                    this.plugin.settings.mouse_scroll_enabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        // TODO: split mouse wheel and touchpad up?
        if (this.plugin.settings.mouse_scroll_enabled) {
            new Setting(containerEl)
                .setName("Scroll speed")
                .setDesc("Controls how fast you scroll using your mouse wheel or trackpad.")
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.mouse_scroll_speed = DEFAULT_SETTINGS.mouse_scroll_speed
                            await this.plugin.saveSettings()
                            this.display();
                        });
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.mouse_scroll_speed)
                    .setLimits(0, 4, 0.1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.mouse_scroll_speed = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Scroll smoothness")
                .setDesc("Determines how smooth scrolling should be. 0 means instant.")
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.mouse_scroll_smoothness = DEFAULT_SETTINGS.mouse_scroll_smoothness
                            await this.plugin.saveSettings()
                            this.display()
                        })
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.mouse_scroll_smoothness)
                    .setLimits(0, 4, 0.1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.mouse_scroll_smoothness = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Invert scroll direction")
                .setDesc("Flips scroll direction.")
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.mouse_scroll_invert)
                    .onChange(async (value) => {
                        this.plugin.settings.mouse_scroll_invert = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        // Centered text cursor settings
        new Setting(containerEl).setHeading();
        new Setting(containerEl)
            .setName("Centered text cursor")
            .setDesc(createFragment(frag => {
                frag.createDiv({}, div => div.innerHTML =
                    "Keeps the text cursor within a comfortable zone while moving or editing. Behaves similarly to Vim's <code>scrolloff</code> option."
                );
            }))
            .setHeading();

        new Setting(containerEl)
            .setName("Enabled")
            .setDesc("Whether to enable the centered cursor feature.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.center_cursor_enabled)
                .onChange(async (value) => {
                    this.plugin.settings.center_cursor_enabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (this.plugin.settings.center_cursor_enabled) {
            new Setting(containerEl)
                .setName("Center radius while editing")
                .setDesc(createFragment(frag => {
                    frag.createDiv({}, div => div.innerHTML =
                        "Defines how far from the screen center the cursor can move before scrolling (in \"%\").<br>" +
                        "0% keeps the cursor perfectly centered.<br>" +
                        "100% effectively disables this feature."
                    );
                }))
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.center_cursor_editing_distance = DEFAULT_SETTINGS.center_cursor_editing_distance
                            await this.plugin.saveSettings()
                            this.display();
                        });
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.center_cursor_editing_distance)
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.center_cursor_editing_distance = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Center radius while moving cursor")
                .setDesc(createFragment(frag => {
                    frag.createDiv({}, div => div.innerHTML =
                        "Defines how far from the screen center the cursor can be moved before scrolling (in \"%\").<br>" +
                        "0% keeps the cursor perfectly centered.<br>" +
                        "100% effectively disables this feature."
                    );
                }))
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.center_cursor_moving_distance = DEFAULT_SETTINGS.center_cursor_moving_distance
                            await this.plugin.saveSettings()
                            this.display();
                        });
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.center_cursor_moving_distance)
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.center_cursor_moving_distance = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Scroll animation when editing")
                .setDesc(createFragment(frag => {
                    frag.createDiv({}, div => div.innerHTML =
                        "Adjusts the smoothness of scrolling when editing moves the cursor outside the central zone.<br>" +
                        "Set to 0 to disable smooth scroll when editing."
                    );
                }))
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.center_cursor_editing_smoothness = DEFAULT_SETTINGS.center_cursor_editing_smoothness
                            await this.plugin.saveSettings()
                            this.display();
                        });
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.center_cursor_editing_smoothness)
                    .setLimits(0, 4, 0.1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.center_cursor_editing_smoothness = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Scroll animation when moving cursor")
                .setDesc(createFragment(frag => {
                    frag.createDiv({}, div => div.innerHTML =
                        "Adjusts the smoothness of scrolling when the text cursor is moved outside the central zone.<br>" +
                        "Set to 0 to disable smooth scroll when moving text cursor."
                    );
                }))
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Restore default')
                        .onClick(async () => {
                            this.plugin.settings.center_cursor_moving_smoothness = DEFAULT_SETTINGS.center_cursor_moving_smoothness
                            await this.plugin.saveSettings()
                            this.display();
                        });
                })
                .addSlider(slider => slider
                    .setValue(this.plugin.settings.center_cursor_moving_smoothness)
                    .setLimits(0, 4, 0.1)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.center_cursor_moving_smoothness = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Invoke on mouse-driven cursor movement")
                .setDesc(createFragment(frag => {
                    frag.createDiv({}, div => div.innerHTML =
                        "Also apply this feature when the text cursor is moved with the mouse.<br>" +
                        "Recommended to keep disabled to avoid unexpected scrolling while using the mouse to reposition the cursor."
                    );
                }))
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.center_cursor_enable_mouse)
                    .onChange(async (value) => {
                        this.plugin.settings.center_cursor_enable_mouse = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        // Scrollbar appearance settings
        new Setting(containerEl);
        new Setting(containerEl)
            .setName("Scrollbar appearance")
            .setHeading();

        new Setting(containerEl)
            .setName("Apply to all scrollbars")
            .setDesc("Whether the following options should apply to all scrollbars in obsidian or only scrollbars in markdown files.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scrollbar_global)
                .onChange(async (value) => {
                    this.plugin.settings.scrollbar_global = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        // dropdown menu: hide all, hide bars (only markdown file), show bars while scrolling, show bar while scrolling (only markdown file), show all
        new Setting(containerEl)
            .setName("Scrollbar visibility")
            .setDesc("When to show scrollbars.")
            .addExtraButton(button => {
                button
                    .setIcon('reset')
                    .setTooltip('Restore default')
                    .onClick(async () => {
                        this.plugin.settings.scrollbar_visibility = DEFAULT_SETTINGS.scrollbar_visibility
                        await this.plugin.saveSettings()
                        this.display();
                    });
            })
            .addDropdown(dropdown => dropdown
                .addOption("hide", "Always hide scrollbars")
                .addOption("scroll", "Show scrollbars while scrolling")
                .addOption("show", "Always show scrollbars")
                .setValue(this.plugin.settings.scrollbar_visibility)
                .onChange(async (value) => {
                    this.plugin.settings.scrollbar_visibility = value;
                    await this.plugin.saveSettings();
                    this.plugin.apply_scrollbar_hide();
                })
            )

        new Setting(containerEl)
            .setName("Scrollbar thickness")
            .setDesc("Width of scrollbars in px.")
            .addExtraButton(button => {
                button
                    .setIcon('reset')
                    .setTooltip('Restore default')
                    .onClick(async () => {
                        this.plugin.settings.scrollbar_width = DEFAULT_SETTINGS.scrollbar_width
                        await this.plugin.saveSettings()
                        this.display();
                    });
            })
            .addSlider(slider => slider
                .setValue(this.plugin.settings.scrollbar_width)
                .setLimits(0, 20, 1)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.scrollbar_width = value;
                    await this.plugin.saveSettings();
                })
            );


    }
}
