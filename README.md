# FavStations Plugin for FM-DX Webserver

**FavStations** is a station lists management plugin for the  [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver).
It allows users to organize stations into multiple lists, to save and load them (locally, from server or from a remote url), customize the interface, and quickly tune to stations with ease. 
Additionally, there is a line of temporary slots that can be used for quick monitoring.
- The Discord plugin page is: https://discord.com/channels/1053804249651359765/1511049768472805477/1511049768472805477

<img width="2642" height="722" alt="main page 2" src="https://github.com/user-attachments/assets/8b3feabd-7551-494f-bbd2-335f977b9e7d" />


## Key Features

*   **Multi-List Management:** Create, rename, delete, save, load and reorder multiple station lists.
*   **Temporary slots:** Rapidly store frequencies on temporary slots, for easy monitoring
*   **Drag & Drop Buttons:** Reorder station buttons simply by dragging them to your preferred position.
*   **Smart Logo Integration:** Automatic logo search using PI Code, Station Name, and ITU.
*   **Automatic loading of lists at startup:**
    *   **Server Mode:** Load stations from the local server JSON.
    *   **Remote Mode:** Sync your lists directly from a remote URL or GitHub (supports auto-conversion to raw links).
    *   **Empty Mode:** Start with a clean slate every session.
*   **Customizable Interface:**
    *   **Visual Dimension Editor:** Resize buttons graphically as you like.
    *   **Temporary Slots:** Up to 30 temporary slots for quick, session-based tuning.
*   **Admin Features:** Administrators can save global default configurations and lists directly to the server for all users.

## Installation

Follow these steps to install the plugin:

1. Copy the `FavStations.js` descriptor file into the `/plugins` directory of your FM-DX-Webserver.
2. Copy the entire `FavStations/` folder into the `/plugins` directory.
3. Restart the FM-DX-Webserver.
4. Log in to the administrator panel, enable the plugin on the Setup page, and save.
5. Restart the FM-DX-Webserver one more time.

- You may also use: https://github.com/mm-prg/Updater

## Usage Guide
*   You can make any list you want, as you like it:
  
1. Add your favourite stations and lists
2. Log in as admninistrator and save them to your server (use manage list, in the gear menu)
3. As an administrator, tell the plugin to load from server at start up (edit settings, in the gear menu)

*   That's all. Now your list will be ready for you when you connect your service.
  
*   A possibile use of this plugin is to create one "Local stations" list, with the stations always available, and more lists for dx reception, one for each direction. So you can easily check the frequencies stored for the selected direction to check if propagation is open for that direction

## Station Buttons and Lists

*   **Add a new station:** Simply click on the "+" button. You can freely mix FM, OIRT, MW, SW stations
*   **Click:** Tune to the station frequency.
*   **Ctrl + Click:** Overwrite the button with the currently tuned station's data (Frequency, Name, PI, etc.).
*   **Right-Click / Long Press:** Open the context menu to edit or delete the station.
*   **Double-Click:** Open the station editor directly.
*   **Select a List:** Click on the dropdown menu
*   **Add a new List:** Open the dropdown menu and click on "+New List"
*   **How to reorder buttons:** Drag the button and drop it in the place you want to put it

## Temporary Slots

<img width="1124" height="57" alt="header" src="https://github.com/user-attachments/assets/1c63506f-a3bd-4c62-a63e-dcbe10522e99" />

*   You may use up to 30 temporary slots for quick, session-based storage
*   Slots are useful for quickly storing frequencies you're monitoring
*   If you make a list of local stations, you may also easily compare these frequencies to find out if an unknown signal (without pi code) transmits the same signal
*   I.e., if you have an unidentified signal, store it in a temporary slot. Then select your list of local stations: the temporary slots remain there. Now you can easily click/tune the unidentified station and the known local stations, to find out if they match
*   **Click:** If the slot is empty, it stores the tuned frequency. If it contains a station, it tunes the station frequency.
*   **Cross Icon:** Clear all slots


## Edit Station data

<img width="573" height="336" alt="edit station page" src="https://github.com/user-attachments/assets/9ea01107-99c0-4ab0-b835-698cb3a754bf" />

*   You can edit the station data by double clicking on it
*   In the name field, you can insert any description you want
*   You can insert the URL of the station logo or leave it empty. You can even add logos to OIRT/MW/SW stations if you want
*   The "world" icon opens the preview of the Logo Repository of FM-DX-Webserver, where you can find many logos
*   If you insert the Pi code and the ITU code of the station, clicking on the "research" icon will try to find the station logo
*   The default value for the antenna is "Don't change," indicating that tuning this station won't alter the antenna setting
*   If you want to automatically use a particular antenna, select "Go to Ant A", etc

## Options Menu (⚙️ Gear Icon)

Accessible next to the list selector, this menu allows you to:
*   **Manage Lists:** Open the management panel to organize your collections.
*   **Edit Settings:** 
    *   **Local Users:** Customize button dimensions and temporary slot counts.
    *   **Admins:** Configure global startup modes and default visibility.
*   **Toggle Logos:** Quickly show or hide station logos on buttons.

## Manage Lists

<img width="568" height="510" alt="list page" src="https://github.com/user-attachments/assets/8ec43df9-f843-4f74-af11-145ee00332eb" />

In the **Manage Lists** panel:
*   **Normal Users:**
*   Use **Import/Export** to handle JSON local backups
*   Click **Reload** to refresh data based on your Startup Mode
*   Use the 🔼/🔽 arrows to change the order of lists in the main dropdown
*   **List Scrolling:** If you have many lists or stations, panels will automatically provide a scrollbar to remain usable

*   **Admin only:** View metadata of the loaded list (Origin, Source), Save to server, Load from server, Load from remote (useful if you want to use the same list for multiple servers)


## Edit Settings

*   As a **Normal Users,** you can choose the number of slots and resize buttons as you like. Options are saved on the browser

If you're logged as **administrator**, settings are saved on the server as default settings

<img width="488" height="476" alt="settings page" src="https://github.com/user-attachments/assets/6cec5c87-ccbe-435b-a503-cea7ae0cb8b5" />

*   **Startup Loading Mode:** Selecting "Server" means that the plugin loads a list saved on the server (you must have saved it before!). Select "Remote" if you want to load the list from a remote url. Select "Empty list" if don't want to load any list
*   **Preloaded Stations Visibility:** You may choose to share your list to all users or not

## Visual Editor for button dimensions

<img width="214" height="267" alt="visual editor" src="https://github.com/user-attachments/assets/fd6516d1-e5a0-44a9-9f97-caa941815226" />

*   You can easily set the button dimensions with a visual editor

## Toggle logos

<img width="1020" height="194" alt="logo on" src="https://github.com/user-attachments/assets/8498be1a-a2ae-4045-b5bd-8c78a62dae62" />

* In the gear menu, there's an option to toggle logo visibility. If you hide logos, frequencies and descriptions are shown
  
<img width="1013" height="186" alt="logo off" src="https://github.com/user-attachments/assets/592bb445-f061-473a-8460-27bf21da621c" />


## Credits

*   Logos are linked from the Logo Repository of the FM-DX-Webserver: https://tef.noobish.eu/logos/logo_preview.html
*   The logo search logic is derived from the wonderful plugin webserver-station-logos https://github.com/Highpoint2000/webserver-station-logos of the incredible Highpoint2000


## Notes
- Comments and suggestions are welcome! Thanks to anyone who tries the plugin and reports any bugs.
- If you like the plugin, please tell me on Discord: https://discord.com/channels/1053804249651359765/1511049768472805477/1511049768472805477
  
*Disclaimer: The plugin is provided as is and without any guarantee. It is recommended to back up your data before performing any change.*
