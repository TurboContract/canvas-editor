import { RowFlex } from '../../dataset/enum/Row'
import { VerticalAlign } from '../../dataset/enum/VerticalAlign'
import { TdBorder, TdSlash } from '../../dataset/enum/table/Table'
import { TextOrientation } from '../../dataset/enum/table/TextOrientation'
import { IElement, IElementPosition } from '../Element'
import { IRow } from '../Row'

export interface ITd {
    conceptId?: string;
    id?: string;
    extension?: unknown;
    externalId?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    colspan: number;
    rowspan: number;
    value: IElement[];
    trIndex?: number;
    tdIndex?: number;
    isLastRowTd?: boolean;
    isLastColTd?: boolean;
    isLastTd?: boolean;
    rowIndex?: number;
    colIndex?: number;
    rowList?: IRow[];
    positionList?: IElementPosition[];
    verticalAlign?: VerticalAlign;
    textOrientation?: TextOrientation;
    /** Для вертикального текста: выравнивание на всю ячейку, не на отдельные абзацы */
    rowFlex?: RowFlex;
    backgroundColor?: string;
    borderTypes?: TdBorder[];
    slashTypes?: TdSlash[];
    mainHeight?: number; // 内容 + 内边距高度
    realHeight?: number; // 真实高度（包含跨列）
    realMinHeight?: number; // 真实最小高度（包含跨列）
    disabled?: boolean; // 内容不可编辑
    deletable?: boolean; // 内容不可删除
    isFormulaEditing?: boolean;
    formula?: string;
}
