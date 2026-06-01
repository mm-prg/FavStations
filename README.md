# FavStations Plugin for FM-DX Webserver

**FavStations** is a station lists management plugin for the  [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver).
It allows users to organize stations into multiple lists, to save and load them (locally, from server or from a remote url), customize the interface, and quickly tune to stations with ease. 
There is a line of temporary slots, useful for watching frequencies. 

<img width="2642" height="722" alt="main page 2" src="https://github.com/user-attachments/assets/8b3feabd-7551-494f-bbd2-335f977b9e7d" />


## Key Features

*   **Multi-List Management:** Create, rename, delete, save, load and reorder multiple station lists.
*   **Temporary slots:** Rapidly store frequencies on temporary slots, for easy watching
*   **Drag & Drop UI:** Reorder station buttons simply by dragging them to your preferred position.
*   **Smart Logo Integration:** 
    *   Automatic logo search using PI Code, Station Name, and ITU.
    *   Integrated **Logo Browser** to manually find icons in the official repository.
*   **Automatic loading of lists at startup:**
    *   **Server Mode:** Load stations from the local server JSON.
    *   **Remote Mode:** Sync your lists directly from a remote URL or GitHub (supports auto-conversion to raw links).
    *   **Empty Mode:** Start with a clean slate every session.
*   **Customizable Interface:**
    *   **Visual Dimension Editor:** Resize buttons graphically as you like.
    *   **Temporary Slots:** Up to 30 temporary slots for quick, session-based tuning.
    *   **Draggable Panels:** All settings and management windows can be moved around the screen.
*   **Data Persistence:** Import and export your collections via JSON files for backup or sharing.
*   **Admin Features:** Administrators can save global default configurations and lists directly to the server for all users.

## Installation

1.  Place the `FavStations` folder into your FM-DX Webserver `plugins` directory.
2.  Ensure `FavStations.js` and `pluginFavStations_server.js` are in the root of the plugin folder.
3.  Restart your FM-DX Webserver.

## Usage Guide

### Station Buttons
*   **Add a new station:** Simpley click on the "+" button.
*   **Click:** Tune to the station frequency.
*   **Ctrl + Click:** Overwrite the button with the currently tuned station's data (Frequency, Name, PI, etc.).
*   **Right-Click / Long Press:** Open the context menu to edit or delete the station.
*   **Double-Click:** Open the station editor directly.
*   **Select a List:** Click on dropdown list menu
*   **Add a new List:** Open the drop down menu and click on "+New List"

### Temporary Slots
*   **Click:** Tune to the station frequency.
*   **Ctrl + Click:** Overwrite the button with the currently tuned station's data (Frequency, Name, PI, etc.).
*   **Right-Click / Long Press:** Open the context menu to edit or delete the station.
*   **Double-Click:** Open the station editor directly.

### Edit Station data

<img width="566" height="320" alt="edit station page" src="https://github.com/user-attachments/assets/187053a0-db29-4bdf-aa61-0d6767ecf97c" />

* You can edit each station data, double clicking on it
* You can insert any url of the station logo
* The world icon opens the Logo Repository of FM-DX-Webserver
* If you insert the Pi code and the ITU code of the station, clicking on the research icon will try to get automatically the station logo


### Settings Menu (⚙️ Gear Icon)

<img width="488" height="476" alt="settings page" src="https://github.com/user-attachments/assets/6cec5c87-ccbe-435b-a503-cea7ae0cb8b5" />

Accessible next to the list selector, this menu allows you to:
*   **Manage Lists:** Open the management panel to organize your collections.
*   **Edit Settings:** 
    *   **Local Users:** Customize button dimensions and temporary slot counts.
    *   **Admins:** Configure global startup modes and default visibility.
*   **Toggle Logos:** Quickly show or hide station logos on buttons.


### Manage Lists

<img width="568" height="510" alt="list page" src="https://github.com/user-attachments/assets/8ec43df9-f843-4f74-af11-145ee00332eb" />

In the **Manage Lists** panel:
*   Use **Import/Export** to handle JSON backups.
*   Click **Reload** to refresh data based on your Startup Mode.
*   Use the 🔼/🔽 arrows to change the order of lists in the main dropdown.
*   **Admin only:** View metadata (Origin, Source, Date) and save the current state as the server default.

### UI Navigation
*   **Move Panels:** Click and drag the title bar of any window to move it.
*   **Quick Close:** Press the `ESC` key or click outside a panel to close it.
*   **Scrolling:** If you have many lists or stations, panels will automatically provide a scrollbar to remain usable.

## Configuration Details

The plugin stores its data in:
*   `FavStations_data.json`: Contains the station lists (Server-side).
*   `plugins_configs/FavStations.json`: Stores the global settings (Server-side).
*   `localStorage`: Stores browser-specific preferences and cache.

## Credits

*   Icons are linked from the Logo Repository of the FM-DX-Webserver: https://tef.noobish.eu/logos/logo_preview.html
*   The logo search logic is derived from the wonderful plugin webserver-station-logos https://github.com/Highpoint2000/webserver-station-logos of the incredible Highpoint2000


## Notes
- Comments and suggestions are welcome! Thanks to anyone who tries the plugin and reports any bugs.
  
*Disclaimer: This plugin requires administrative privileges and an active internet connection to communicate with GitHub. The plugin is provided as is and without any guarantee. It is recommended to back up your data before performing any change.*
