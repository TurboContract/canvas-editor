/**
 * Text orientation inside a table cell.
 *
 * Default 3 variants (Word-like):
 * - horizontal
 * - vertical top-to-bottom
 * - vertical bottom-to-top
 *
 * Backend hint for Apache POI (XLSX):
 * - TextDirection.HORIZONTAL -> HORIZONTAL
 * - TextDirection.VERTICAL -> VERTICAL_TOP_TO_BOTTOM
 * - TextDirection.VERTICAL_270 -> VERTICAL_BOTTOM_TO_TOP
 */
export enum TextOrientation {
    HORIZONTAL = 'horizontal',
    VERTICAL_TOP_TO_BOTTOM = 'vertical_top_to_bottom',
    VERTICAL_BOTTOM_TO_TOP = 'vertical_bottom_to_top',
}

// По умолчанию в Word/таблицах: текст горизонтально.
export const DEFAULT_TEXT_ORIENTATION = TextOrientation.HORIZONTAL

