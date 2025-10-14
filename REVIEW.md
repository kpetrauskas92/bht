# Code Review Notes

## Summary
- Overall the codebase is well structured and easy to follow.
- I focused on interaction flows in `main.js`, especially the import handler and global keyboard shortcuts.

## Issues Found

### 1. Import field is not reset after reading a file
- **File**: `main.js`
- **Location**: `handleImport` (around lines 342-360)
- **Problem**: After a JSON file is successfully imported or an error is shown, the `<input type="file">` retains the selected file. Browsers do not fire another `change` event if the user picks the exact same file again, so a user can't re-import the same backup twice in a row.
- **Impact**: Prevents users from retrying an import with the same file (e.g., after tweaking settings and wanting to restore the previous state).
- **Recommendation**: Reset the file input's value (`event.target.value = ''`) inside both the success and error branches once processing finishes.

### 2. Global `Enter` shortcut overrides button interactions
- **File**: `main.js`
- **Location**: `handleGlobalKeys` (around lines 136-167)
- **Problem**: The handler treats any non-input/select/textarea target as eligible for the global `Enter` shortcut, which calls `checkAnswer()`. This captures keyboard activation on buttons (e.g., the modal "Close" buttons or the "Next" button). When the user presses `Enter` while focused on those buttons, the default button action is prevented and the app checks the current answer instead.
- **Impact**: Breaks expected keyboard behavior, especially in the accessibility-oriented modal dialogs and toolbar buttons.
- **Recommendation**: Treat `<button>` elements as form controls in the early bailout, or otherwise detect when a button has focus and skip the global shortcut so the button receives the `Enter` key press.

## Suggestions
- Consider adding automated tests around keyboard interaction to guard against regressions.
- Document the expected UX for import/export edge cases to ensure future changes maintain parity.
