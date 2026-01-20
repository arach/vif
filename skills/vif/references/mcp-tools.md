# vif MCP Tools Reference

Complete parameter reference for all vif MCP tools.

## Overlay Tools

### vif_cursor_show
Show the animated cursor overlay.
- No parameters

### vif_cursor_hide
Hide the cursor overlay.
- No parameters

### vif_cursor_move
Move cursor to position with animation.
- `x` (number, required) - X coordinate
- `y` (number, required) - Y coordinate
- `duration` (number) - Animation duration in seconds (default: 0.3)

### vif_cursor_click
Perform click animation at current position.
- No parameters

### vif_label_show
Show a label/caption overlay.
- `text` (string, required) - Text to display
- `position` (string) - "top" or "bottom" (default: "top")

### vif_label_update
Update the label text.
- `text` (string, required) - New text

### vif_label_hide
Hide the label overlay.
- No parameters

### vif_camera_show
Show camera overlay.
- `position` (string) - "auto", "top-left", "top-right", "bottom-left", "bottom-right"
- `size` (string|number) - "small", "medium", "large", or pixels

### vif_camera_set
Update camera position/size.
- `position` (string) - Position enum
- `size` (string|number) - Size value

### vif_camera_hide
Hide camera overlay.
- No parameters

### vif_backdrop_show
Show backdrop (dims everything outside viewport).
- No parameters

### vif_backdrop_hide
Hide the backdrop.
- No parameters

### vif_viewport_set
Set the viewport region.
- `x` (number, required) - X coordinate
- `y` (number, required) - Y coordinate
- `width` (number, required) - Width
- `height` (number, required) - Height

### vif_viewport_show
Show the viewport mask.
- No parameters

### vif_viewport_hide
Hide the viewport mask.
- No parameters

### vif_stage_center
Center an app window on screen.
- `app` (string, required) - App name (e.g., "Safari")
- `width` (number) - Window width
- `height` (number) - Window height

### vif_stage_clear
Clear all stage elements.
- No parameters

### vif_keys_show
Show keyboard shortcut overlay.
- `keys` (string[], required) - Keys to show, e.g., ["cmd", "shift", "p"]
- `press` (boolean) - Animate as key press

### vif_keys_hide
Hide the keys overlay.
- No parameters

### vif_typer_type
Show animated typing overlay.
- `text` (string, required) - Text to type
- `style` (string) - "default", "terminal", or "code"
- `delay` (number) - Delay between characters (default: 0.05)

### vif_typer_hide
Hide the typer overlay.
- No parameters

### vif_record_indicator
Show/hide recording indicator.
- `show` (boolean, required) - Whether to show

## Browser Tools

### vif_browser_launch
Launch Chrome with remote debugging.
- `url` (string) - Initial URL to navigate to
- `headless` (boolean) - Run in headless mode (default: false)

### vif_browser_close
Close the Chrome browser instance.
- No parameters

### vif_browser_navigate
Navigate to a URL.
- `url` (string, required) - URL to navigate to
- `waitUntil` (string) - "load", "domcontentloaded", or "networkidle"

### vif_browser_click
Click element by CSS selector.
- `selector` (string, required) - CSS selector

### vif_browser_type
Type text into element.
- `selector` (string) - CSS selector (uses focused element if omitted)
- `text` (string, required) - Text to type
- `clear` (boolean) - Clear existing text first
- `delay` (number) - Delay between keystrokes in ms

### vif_browser_scroll
Scroll the page or element.
- `direction` (string, required) - "up", "down", "left", "right"
- `amount` (number) - Pixels to scroll (default: 400)
- `selector` (string) - Element to scroll (default: page)

### vif_browser_extract
Extract text content using CSS selectors.
- `selectors` (object, required) - Map of names to selectors
  ```json
  {"title": "h1", "links": "a.nav"}
  ```

### vif_browser_press
Press a keyboard key or shortcut.
- `key` (string) - Single key, e.g., "Enter", "Tab"
- `keys` (string[]) - Shortcut as array, e.g., ["cmd", "c"]

### vif_browser_hover
Hover over an element.
- `selector` (string, required) - CSS selector

### vif_observe
Get interactive elements on the page.
- `format` (string) - "clickable", "accessibility", or "full"
- `selector` (string) - Filter to elements matching selector

Returns array of elements with:
- `nodeId` - Use with vif_click_element
- `tag`, `role`, `label`, `text`
- `bounds` - {x, y, width, height, centerX, centerY}

### vif_click_element
Click element by node ID or label.
- `nodeId` (number) - Node ID from vif_observe
- `label` (string) - Find by accessible label
- `role` (string) - Filter by role when using label

### vif_screenshot
Capture a screenshot.
- `format` (string) - "png", "jpeg", "webp" (default: png)
- `fullPage` (boolean) - Capture full page
- `selector` (string) - Capture specific element
