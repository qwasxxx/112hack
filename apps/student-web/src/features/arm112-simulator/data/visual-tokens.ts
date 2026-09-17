/**
 * Visual tokens sampled from ARM-112 / DDS screenshots.
 * Values are approximations of the enterprise UI, not the student portal 3D style.
 * Exact hex codes are not printed in sources; marked as observed.
 */

export const ARM112_VISUAL = {
  canvas: {
    pageBackground: '#c5c5c5',
    panelBackground: '#ffffff',
    headerBackground: '#ececec',
    mutedText: '#757575',
    bodyText: '#212121',
    border: '#d4d4d4',
    radiusPanel: '0px',
    radiusChip: '2px',
    radiusButton: '2px',
  },
  accent: {
    orange: '#f15a24',
    orangeFooter: '#f15a24',
    blueSelected: '#1e88e5',
    incomingCallBlue: '#1e88e5',
    burgundyLink: '#7a1f3d',
    timerDefault: '#2b2b2b',
    timerExceeded: '#e53935',
    journalHeader: '#2c3338',
    journalRow: '#3a4146',
  },
  layout: {
    /** Observed split on create-card screenshots: left address column vs right incident column. */
    leftPaneRatio: 0.42,
    rightPaneRatio: 0.58,
    footerHeightPx: 52,
    headerPhonesHeightPx: 72,
    timerWidthPx: 88,
  },
  type: {
    ui: 'Arial, Helvetica, sans-serif',
    labelSize: '12px',
    titleSize: '14px',
    timerSize: '28px',
  },
  note: 'not evidenced by source: exact hex, font-family file, spacing grid. Observed from PNG screenshots only.',
} as const;
