# Changelog

All notable changes to this project will be documented in this file.

## [v0.2.4] - 2026-02-24

### 🌐 Internationalization (i18n)
- **Comprehensive SFTP Locale Coverage**: Completely removed all hardcoded Chinese strings inside the SFTP interfaces.
  - Translated the SFTP Toolbar (actions, bookmarks, preview).
  - Translated the SFTP Transfer Queue (status, actions, progress indicators).
  - Translated the SFTP File List (table headers, empty states, and contextual right-click menus).
  - Translated the SFTP Directory Tree (loading states) and File Preview components.
- Now the entire SFTP workspace seamlessly switches between "English" and "中文 (简体)" based on user preference.


## [v0.2.3] - 2026-02-24

### 🚀 Features

- **SFTP Bookmarks System**: Instantly pin directories with custom aliases, complete with an inline search function to easily navigate your saved paths.
- **Terminal to SFTP Navigation**: Open the current working directory of your terminal directly into a new SFTP tab with a single right-click on the tab header.
- **Improved Settings / Safety**: Disabled `deleteAppDataOnUninstall` for Windows installers. Now, uninstalling or auto-updating the app will no longer wipe out your saved hosts, keys, and preferences.

### 🐛 Bug Fixes & Refactors
- **UI Adjustments**: Resolved scrollbar overlaps within the terminal pane making it easier to drag.
- **Toolbar Dropdown Fixes**: Fixed CSS clipping issues in the SFTP toolbar that caused the bookmark dropdown to be hidden.
- **Documentation**: Restructured README for better visibility of full-width screenshots.
