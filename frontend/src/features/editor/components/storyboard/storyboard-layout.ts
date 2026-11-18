// Shared layout for the virtualized storyboard grid.
//
// The sticky header row and every body row use the SAME column template so
// columns line up, and every row is a FIXED height so @tanstack/react-virtual
// can virtualize without measuring each row. Keeping these values in one place
// prevents the header and rows from drifting out of alignment.
export const STORYBOARD_ROW_HEIGHT = 144

export const STORYBOARD_GRID_TEMPLATE =
  '36px 42px minmax(216px,1fr) 154px 106px 106px 110px 110px 44px'

// Sum of the fixed columns and the script minimum, with horizontal scrolling below it.
export const STORYBOARD_MIN_WIDTH = 924

// Number of off-screen rows rendered above/below the viewport for smooth scroll.
export const STORYBOARD_OVERSCAN = 4
