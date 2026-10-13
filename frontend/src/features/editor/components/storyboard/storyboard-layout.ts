// Shared layout for the virtualized storyboard grid.
//
// The sticky header row and every body row use the SAME column template so
// columns line up, and every row is a FIXED height so @tanstack/react-virtual
// can virtualize without measuring each row. Keeping these values in one place
// prevents the header and rows from drifting out of alignment.
export const STORYBOARD_ROW_HEIGHT = 144

export const STORYBOARD_GRID_TEMPLATE =
  '48px 64px minmax(320px,1fr) 220px 144px 144px 152px 152px 132px'

// Sum of the fixed columns (1056) + the script column min (320). Used as the
// horizontal-scroll min width so columns never collapse below their design size.
export const STORYBOARD_MIN_WIDTH = 1376

// Number of off-screen rows rendered above/below the viewport for smooth scroll.
export const STORYBOARD_OVERSCAN = 4
