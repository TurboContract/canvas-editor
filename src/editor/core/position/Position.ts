import { ElementType, ListStyle, RowFlex, VerticalAlign } from '../..'
import { ZERO } from '../../dataset/constant/Common'
import { ControlComponent } from '../../dataset/enum/Control'
import {
    IComputePageRowPositionPayload,
    IComputePageRowPositionResult,
    IComputeRowPositionPayload,
    IFloatPosition,
    IGetFloatPositionByXYPayload,
    ISetSurroundPositionPayload,
} from '../../interface/Position'
import { IEditorOption } from '../../interface/Editor'
import { IElement, IElementPosition } from '../../interface/Element'
import {
    ICurrentPosition,
    IGetPositionByXYPayload,
    IPositionContext,
} from '../../interface/Position'
import { Draw } from '../draw/Draw'
import { EditorMode, EditorZone } from '../../dataset/enum/Editor'
import { deepClone, isRectIntersect } from '../../utils'
import { ImageDisplay } from '../../dataset/enum/Common'
import { TextOrientation } from '../../dataset/enum/table/TextOrientation'
import { DeepRequired } from '../../interface/Common'
import { EventBus } from '../event/eventbus/EventBus'
import { EventBusMap } from '../../interface/EventBus'
import { getIsBlockElement } from '../../utils/element'

/** Обратное к `Draw.ts` transform для вертикали: экранная точка → координаты до ctx.transform (как в positionList). */
function layoutPointFromVerticalTdScreen(
    orientation: TextOrientation,
    screenX: number,
    screenY: number,
    tdX: number,
    tdY: number,
    tdW: number,
): [number, number] {
    if (orientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM) {
        const layoutX = tdX + tdY + tdW - screenY
        const layoutY = screenX - tdX + tdY
        return [layoutX, layoutY]
    }
    if (orientation === TextOrientation.VERTICAL_BOTTOM_TO_TOP) {
        const layoutX = screenY - tdY + tdX
        const layoutY = tdX + tdY - screenX
        return [layoutX, layoutY]
    }
    return [screenX, screenY]
}

export class Position {
    private cursorPosition: IElementPosition | null
    private positionContext: IPositionContext
    private positionList: IElementPosition[]
    private floatPositionList: IFloatPosition[]

    private draw: Draw
    private eventBus: EventBus<EventBusMap>
    private options: DeepRequired<IEditorOption>

    constructor(draw: Draw) {
        this.positionList = []
        this.floatPositionList = []
        this.cursorPosition = null
        this.positionContext = {
            isTable: false,
            isControl: false,
        }

        this.draw = draw
        this.eventBus = draw.getEventBus()
        this.options = draw.getOptions()
    }

    public getFloatPositionList(): IFloatPosition[] {
        return this.floatPositionList
    }

    public getTablePositionList(
        sourceElementList: IElement[],
    ): IElementPosition[] {
        const { index, trIndex, tdIndex } = this.positionContext
        return (
            sourceElementList[index!].trList![trIndex!].tdList[tdIndex!]
                .positionList || []
        )
    }

    public getPositionList(): IElementPosition[] {
        return this.positionContext.isTable
            ? this.getTablePositionList(this.draw.getOriginalElementList())
            : this.getOriginalPositionList()
    }

    public getMainPositionList(): IElementPosition[] {
        return this.positionContext.isTable
            ? this.getTablePositionList(this.draw.getOriginalMainElementList())
            : this.positionList
    }

    public getOriginalPositionList(): IElementPosition[] {
        const zoneManager = this.draw.getZone()
        if (zoneManager.isHeaderActive()) {
            const header = this.draw.getHeader()
            return header.getPositionList()
        }
        if (zoneManager.isFooterActive()) {
            const footer = this.draw.getFooter()
            return footer.getPositionList()
        }
        return this.positionList
    }

    public getOriginalMainPositionList(): IElementPosition[] {
        return this.positionList
    }

    public getSelectionPositionList(): IElementPosition[] | null {
        const { startIndex, endIndex } = this.draw.getRange().getRange()
        if (startIndex === endIndex) return null
        const positionList = this.getPositionList()
        return positionList.slice(startIndex + 1, endIndex + 1)
    }

    public setPositionList(payload: IElementPosition[]) {
        this.positionList = payload
    }

    public setFloatPositionList(payload: IFloatPosition[]) {
        this.floatPositionList = payload
    }

    public computePageRowPosition(
        payload: IComputePageRowPositionPayload,
    ): IComputePageRowPositionResult {
        const {
            positionList,
            rowList,
            pageNo,
            startX,
            startY,
            startRowIndex,
            startIndex,
            innerWidth,
            zone,
        } = payload

        const {
            scale,
            table: { tdPadding },
        } = this.options

        let x = startX
        let y = startY
        let index = startIndex
        let tableTdOrientation = TextOrientation.HORIZONTAL
        let tableTdAlignExtent = innerWidth
        if (
            payload.isTable &&
            payload.index !== undefined &&
            payload.trIndex !== undefined &&
            payload.tdIndex !== undefined
        ) {
            const tableElement = this.draw.getOriginalElementList()[payload.index]
            const td =
                tableElement?.trList?.[payload.trIndex]?.tdList?.[payload.tdIndex]
            tableTdOrientation = td?.textOrientation ?? TextOrientation.HORIZONTAL
            if (td) {
                const tdPaddingWidth = tdPadding[1] + tdPadding[3]
                const tdPaddingHeight = tdPadding[0] + tdPadding[2]
                // Горизонталь ячейки: внутренняя ширина. Вертикальный текст: rowFlex по
                // горизонтали экрана после поворота — полоса = внутренняя высота TD (см. Draw).
                tableTdAlignExtent =
                    tableTdOrientation === TextOrientation.HORIZONTAL
                        ? (td.width! - tdPaddingWidth) * scale
                        : (td.height! - tdPaddingHeight) * scale
            }
        }
        // Перенос вертикального текста: сдвиг по layout-Y между «колонками» (в сумме высот строк).
        // 270° + left: якорим последнюю колонку у левого края полосы.
        // 90° + right: якорим последнюю колонку у правого края полосы (зеркально).
        const verticalMultiColumnStripShift =
            payload.isTable &&
            tableTdOrientation !== TextOrientation.HORIZONTAL
                ? rowList.reduce(
                      (sum, row, idx) =>
                          idx < rowList.length - 1 ? sum + row.height : sum,
                      0,
                  )
                : 0
        for (let i = 0; i < rowList.length; i++) {
            const curRow = rowList[i]

            let leftIndent = 0
            let firstLineIndent = 0
            let rightIndent = 0
            let rowX = x

            const currentId =
                curRow.elementList.find((el) => el.id)?.id || null
            const isFirstRowInParagraph = rowList.findIndex((row) =>
                row.elementList.find((el) => el.id === currentId),
            )
            for (const element of curRow.elementList) {
                leftIndent = element.spacing?.before || leftIndent
                firstLineIndent = element.spacing?.firstLine || firstLineIndent
                rightIndent = element.spacing?.after || rightIndent
                if (leftIndent || firstLineIndent || rightIndent) {
                    break
                }
            }
            rowX = startX + leftIndent
            if (isFirstRowInParagraph === i) {
                rowX += firstLineIndent - leftIndent
            }

            let rowY = y
            if (!curRow.isSurround) {
                const curRowWidth = curRow.width + (curRow.offsetX || 0)
                // 270°: x' = -y + const в Draw.ts — уменьшение rowY сдвигает текст вправо.
                if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_BOTTOM_TO_TOP &&
                    (curRow.rowFlex === undefined ||
                        curRow.rowFlex === RowFlex.LEFT)
                ) {
                    rowY -= verticalMultiColumnStripShift
                    rowY -= curRow.height
                } else if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_BOTTOM_TO_TOP &&
                    curRow.rowFlex === RowFlex.CENTER
                ) {
                    // Ровно между уже настроенными LEFT и RIGHT: x' = −y + const в Draw.
                    const h = curRow.height
                    const rowYLeft = y - verticalMultiColumnStripShift - h
                    const rowYRight = y - innerWidth - h / 2
                    rowY = (rowYLeft + rowYRight) / 2
                } else if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_BOTTOM_TO_TOP &&
                    curRow.rowFlex === RowFlex.RIGHT
                ) {
                    // Без доп. сдвига по числу колонок: первая строка = как при одной строке,
                    // следующие только за счёт накопленного y (иначе первая уезжала бы влево).
                    rowY -= curRow.height
                } else if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_TOP_TO_BOTTOM &&
                    curRow.rowFlex === RowFlex.RIGHT
                ) {
                    rowY -= verticalMultiColumnStripShift
                }
                // Вертикаль в TD: в полосу по горизонтали экрана входит «толщина» строки (высота ряда).
                const curRowVisualWidthForVertical =
                    payload.isTable &&
                    tableTdOrientation !== TextOrientation.HORIZONTAL
                        ? curRow.height
                        : curRowWidth
                let flexOffset = 0
                if (curRow.rowFlex === RowFlex.CENTER) {
                    if (
                        payload.isTable &&
                        tableTdOrientation ===
                            TextOrientation.VERTICAL_BOTTOM_TO_TOP
                    ) {
                        flexOffset = 0
                    } else {
                        const alignWidth =
                            payload.isTable &&
                            tableTdOrientation !== TextOrientation.HORIZONTAL
                                ? curRowVisualWidthForVertical
                                : curRowWidth
                        const alignExtent =
                            payload.isTable &&
                            tableTdOrientation !== TextOrientation.HORIZONTAL
                                ? tableTdAlignExtent
                                : innerWidth
                        flexOffset = (alignExtent - alignWidth) / 2
                    }
                } else if (curRow.rowFlex === RowFlex.RIGHT) {
                    const alignWidth =
                        payload.isTable &&
                        tableTdOrientation !== TextOrientation.HORIZONTAL
                            ? curRowVisualWidthForVertical
                            : curRowWidth
                    // В TD innerWidth = (td.width − padding)·scale — для colspan уже полная ширина.
                    // Для вертикали LEFT/CENTER полоса rowFlex по экрану X задаётся tableTdAlignExtent
                    // (внутренняя высота); для RIGHT — от правого края по внутренней ширине ячейки.
                    const alignExtent = innerWidth
                    flexOffset = alignExtent - alignWidth
                }
                // Вертикаль в TD: 270° center — среднее LEFT/RIGHT выше; 90° center — +=flex.
                if (payload.isTable && tableTdOrientation !== TextOrientation.HORIZONTAL) {
                    if (
                        tableTdOrientation ===
                            TextOrientation.VERTICAL_BOTTOM_TO_TOP &&
                        curRow.rowFlex === RowFlex.CENTER
                    ) {
                        // уже: rowY = (rowYLeft + rowYRight) / 2
                    } else if (
                        curRow.rowFlex === RowFlex.CENTER ||
                        tableTdOrientation ===
                            TextOrientation.VERTICAL_TOP_TO_BOTTOM
                    ) {
                        rowY += flexOffset
                    } else {
                        rowY -= flexOffset
                    }
                } else {
                    rowX += flexOffset
                }
                // 90° + right: зазор ~½ высоты строки, поджат на 4px (в масштабе редактора).
                if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_TOP_TO_BOTTOM &&
                    curRow.rowFlex === RowFlex.RIGHT
                ) {
                    rowY += curRow.height / 2 - 4 * scale
                }
                // 270° + right: вправо на ~½ высоты строки (x' = −y + const в Draw).
                if (
                    payload.isTable &&
                    tableTdOrientation ===
                        TextOrientation.VERTICAL_BOTTOM_TO_TOP &&
                    curRow.rowFlex === RowFlex.RIGHT
                ) {
                    rowY -= curRow.height / 2
                }
            }

            rowX += curRow.offsetX || 0
            const tablePreX = rowX
            const tablePreY = rowY

            for (let j = 0; j < curRow.elementList.length; j++) {
                const element = curRow.elementList[j]
                const metrics = element.metrics
                if (
                    element.type === ElementType.SEPARATOR &&
                    element.isFootnote
                ) {
                    const pageHeight = this.draw.getHeight()
                    const margins = this.draw.getMargins() // [top, right, bottom, left]
                    const headerHeight = this.draw.getHeader().getHeight()
                    const footerHeight = this.draw.getFooter().getHeight()
                    const extraHeight = this.draw.getHeader().getExtraHeight()

                    const availableHeight =
                        pageHeight -
                        margins[0] -
                        margins[2] -
                        headerHeight -
                        footerHeight -
                        extraHeight

                    const maxY =
                        margins[0] +
                        headerHeight +
                        extraHeight +
                        availableHeight -
                        metrics.height

                    const contentBelowHeight = rowList
                        .slice(i + 1)
                        .reduce((sum, row) => sum + row.height, 0)

                    y = maxY - contentBelowHeight
                }
                const offsetY =
                    (element.imgDisplay !== ImageDisplay.INLINE &&
                        element.type === ElementType.IMAGE) ||
                    element.type === ElementType.LATEX
                        ? curRow.ascent - metrics.height
                        : curRow.ascent

                const positionItem: IElementPosition = {
                    pageNo,
                    index,
                    value: element.value,
                    rowIndex: startRowIndex + i,
                    rowNo: i,
                    metrics,
                    left: element.left || 0,
                    ascent: offsetY,
                    lineHeight: curRow.height,
                    isFirstLetter: j === 0,
                    isLastLetter: j === curRow.elementList.length - 1,
                    coordinate: {
                        leftTop: [rowX, rowY],
                        leftBottom: [rowX, rowY + curRow.height],
                        rightTop: [rowX + metrics.width, rowY],
                        rightBottom: [rowX + metrics.width, rowY + curRow.height],
                    },
                }

                if (
                    element.imgDisplay === ImageDisplay.SURROUND ||
                    element.imgDisplay === ImageDisplay.FLOAT_TOP ||
                    element.imgDisplay === ImageDisplay.FLOAT_BOTTOM
                ) {
                    const prePosition = positionList[positionList.length - 1]
                    if (prePosition) {
                        positionItem.metrics = prePosition.metrics
                        positionItem.coordinate = prePosition.coordinate
                    }
                    if (!element.imgFloatPosition) {
                        element.imgFloatPosition = {
                            x,
                            y,
                            pageNo,
                        }
                    }
                    this.floatPositionList.push({
                        pageNo,
                        element,
                        position: positionItem,
                        isTable: payload.isTable,
                        index: payload.index,
                        tdIndex: payload.tdIndex,
                        trIndex: payload.trIndex,
                        tdValueIndex: index,
                        zone,
                    })
                }

                positionList.push(positionItem)
                index++
                rowX += metrics.width
            }

            if (
                curRow.elementList.some(
                    (element) => element.type === ElementType.TABLE,
                )
            ) {
                for (let j = 0; j < curRow.elementList.length; j++) {
                    const element = curRow.elementList[j]
                    if (element.type === ElementType.TABLE) {
                        const tdPaddingWidth = tdPadding[1] + tdPadding[3]
                        for (let t = 0; t < element.trList!.length; t++) {
                            const tr = element.trList![t]
                            for (let d = 0; d < tr.tdList!.length; d++) {
                                const td = tr.tdList[d]
                                // Ориентация текста внутри ячейки: по умолчанию горизонтальная.
                                // Рендер внутри `Draw.ts` использует td.textOrientation.
                                td.textOrientation ??= TextOrientation.HORIZONTAL
                                td.positionList = []
                                const rowList = td.rowList!
                                const drawRowResult =
                                    this.computePageRowPosition({
                                        positionList: td.positionList,
                                        rowList,
                                        pageNo,
                                        startRowIndex: 0,
                                        startIndex: 0,
                                        startX:
                                            (td.x! + tdPadding[3]) * scale +
                                            tablePreX,
                                        startY:
                                            (td.y! + tdPadding[0]) * scale +
                                            tablePreY,
                                        innerWidth:
                                            (td.width! - tdPaddingWidth) *
                                            scale,
                                        isTable: true,
                                        index: index - 1,
                                        tdIndex: d,
                                        trIndex: t,
                                        zone,
                                    })

                                const tdOrientation =
                                    td.textOrientation ??
                                    TextOrientation.HORIZONTAL
                                const tdVerticalAlign =
                                    td.verticalAlign ?? VerticalAlign.TOP
                                if (td.positionList.length) {
                                    let xDelta = 0
                                    let yDelta = 0
                                    const tdX = (td.x ?? 0) * scale + tablePreX
                                    const tdY = (td.y ?? 0) * scale + tablePreY
                                    const tdW = (td.width ?? 0) * scale
                                    const tdH = (td.height ?? 0) * scale
                                    const innerTop = tdY + tdPadding[0] * scale
                                    const innerBottom =
                                        tdY + tdH - tdPadding[2] * scale

                                    if (
                                        tdOrientation ===
                                            TextOrientation.VERTICAL_TOP_TO_BOTTOM ||
                                        tdOrientation ===
                                            TextOrientation.VERTICAL_BOTTOM_TO_TOP
                                    ) {
                                        const topVisualInset = 2 * scale
                                        const cornerList = td.positionList.flatMap(
                                            (p) => [
                                                p.coordinate.leftTop,
                                                p.coordinate.leftBottom,
                                                p.coordinate.rightTop,
                                                p.coordinate.rightBottom,
                                            ],
                                        )
                                        const yPrimeList = cornerList.map(
                                            ([x]) => {
                                                if (
                                                    tdOrientation ===
                                                    TextOrientation.VERTICAL_TOP_TO_BOTTOM
                                                ) {
                                                    return -x + (tdY + tdX + tdW)
                                                }
                                                return x + (tdY - tdX)
                                            },
                                        )
                                        const contentTop = Math.min(...yPrimeList)
                                        const contentBottom =
                                            Math.max(...yPrimeList)
                                        let deltaY = 0
                                        if (tdVerticalAlign === VerticalAlign.TOP) {
                                            deltaY =
                                                innerTop +
                                                topVisualInset -
                                                contentTop
                                        } else if (
                                            tdVerticalAlign === VerticalAlign.MIDDLE
                                        ) {
                                            deltaY =
                                                (innerTop + innerBottom) / 2 -
                                                (contentTop + contentBottom) / 2
                                        } else if (
                                            tdVerticalAlign === VerticalAlign.BOTTOM
                                        ) {
                                            deltaY = innerBottom - contentBottom
                                        }
                                        xDelta =
                                            tdOrientation ===
                                            TextOrientation.VERTICAL_TOP_TO_BOTTOM
                                                ? -deltaY
                                                : deltaY
                                    } else {
                                        const cornerList = td.positionList.flatMap(
                                            (p) => [
                                                p.coordinate.leftTop,
                                                p.coordinate.leftBottom,
                                                p.coordinate.rightTop,
                                                p.coordinate.rightBottom,
                                            ],
                                        )
                                        const yList = cornerList.map(([, y]) => y)
                                        const contentTop = Math.min(...yList)
                                        const contentBottom = Math.max(...yList)
                                        if (tdVerticalAlign === VerticalAlign.TOP) {
                                            yDelta = innerTop - contentTop
                                        } else if (
                                            tdVerticalAlign === VerticalAlign.MIDDLE
                                        ) {
                                            yDelta =
                                                (innerTop + innerBottom) / 2 -
                                                (contentTop + contentBottom) / 2
                                        } else if (
                                            tdVerticalAlign === VerticalAlign.BOTTOM
                                        ) {
                                            yDelta = innerBottom - contentBottom
                                        }
                                    }

                                    if (xDelta || yDelta) {
                                        td.positionList.forEach((tdPosition) => {
                                            const {
                                                coordinate: {
                                                    leftTop,
                                                    leftBottom,
                                                    rightBottom,
                                                    rightTop,
                                                },
                                            } = tdPosition

                                            leftTop[0] += xDelta
                                            leftBottom[0] += xDelta
                                            rightBottom[0] += xDelta
                                            rightTop[0] += xDelta

                                            leftTop[1] += yDelta
                                            leftBottom[1] += yDelta
                                            rightBottom[1] += yDelta
                                            rightTop[1] += yDelta
                                        })
                                    }
                                }
                                x = drawRowResult.x
                                y = drawRowResult.y
                            }
                        }
                        x = tablePreX
                        y = tablePreY
                    }
                }
            }

            x = startX
            y += curRow.height
        }

        return { x, y, index }
    }

    public computePositionList() {
        // 置空原位置信息
        this.positionList = []
        // 按每页行计算
        const innerWidth = this.draw.getInnerWidth()
        const pageRowList = this.draw.getPageRowList()
        const margins = this.draw.getMargins()
        const startX = margins[3]
        // 起始位置受页眉影响
        const header = this.draw.getHeader()
        const extraHeight = header.getExtraHeight()
        const startY = margins[0] + extraHeight
        let startRowIndex = 0
        for (let i = 0; i < pageRowList.length; i++) {
            const rowList = pageRowList[i]
            const startIndex = rowList[0]?.startIndex
            this.computePageRowPosition({
                positionList: this.positionList,
                rowList,
                pageNo: i,
                startRowIndex,
                startIndex,
                startX,
                startY,
                innerWidth,
            })
            startRowIndex += rowList.length
        }
    }

    public computeRowPosition(
        payload: IComputeRowPositionPayload,
    ): IElementPosition[] {
        const { row, innerWidth } = payload
        const positionList: IElementPosition[] = []
        this.computePageRowPosition({
            positionList,
            innerWidth,
            rowList: [deepClone(row)],
            pageNo: 0,
            startX: 0,
            startY: 0,
            startIndex: 0,
            startRowIndex: 0,
        })
        return positionList
    }

    public setCursorPosition(position: IElementPosition | null) {
        this.cursorPosition = position
    }

    public getCursorPosition(): IElementPosition | null {
        return this.cursorPosition
    }

    public getPositionContext(): IPositionContext {
        return this.positionContext
    }

    public setPositionContext(payload: IPositionContext) {
        this.eventBus.emit('positionContextChange', {
            value: payload,
            oldValue: this.positionContext,
        })
        this.positionContext = payload
    }

    public getPositionByXY(payload: IGetPositionByXYPayload): ICurrentPosition {
        const { x, y, isTable } = payload
        let { elementList, positionList } = payload
        if (!elementList) {
            elementList = this.draw.getOriginalElementList()
        }
        if (!positionList) {
            positionList = this.getOriginalPositionList()
        }
        let hitX = x
        let hitY = y
        const { td: payloadTd, tablePosition: payloadTablePosition } = payload
        if (
            isTable &&
            payloadTd &&
            payloadTablePosition &&
            (payloadTd.textOrientation ?? TextOrientation.HORIZONTAL) !==
                TextOrientation.HORIZONTAL
        ) {
            const { scale } = this.options
            const { leftTop } = payloadTablePosition.coordinate
            const tdX = payloadTd.x! * scale + leftTop[0]
            const tdY = payloadTd.y! * scale + leftTop[1]
            const tdW = (payloadTd.width ?? 0) * scale
            ;[hitX, hitY] = layoutPointFromVerticalTdScreen(
                payloadTd.textOrientation!,
                x,
                y,
                tdX,
                tdY,
                tdW,
            )
        }
        const zoneManager = this.draw.getZone()
        const curPageNo = payload.pageNo ?? this.draw.getPageNo()
        const isMainActive = zoneManager.isMainActive()
        const positionNo = isMainActive ? curPageNo : 0
        // 验证浮于文字上方元素
        if (!isTable) {
            const floatTopPosition = this.getFloatPositionByXY({
                ...payload,
                imgDisplays: [ImageDisplay.FLOAT_TOP, ImageDisplay.SURROUND],
            })
            if (floatTopPosition) return floatTopPosition
        }
        // 普通元素
        for (let j = 0; j < positionList.length; j++) {
            const {
                index,
                pageNo,
                left,
                isFirstLetter,
                coordinate: { leftTop, rightTop, leftBottom },
            } = positionList[j]
            if (positionNo !== pageNo) continue
            if (pageNo > positionNo) break
            // 命中元素（вертикаль в TD: координаты клика в пространстве positionList)
            if (
                leftTop[0] - left <= hitX &&
                rightTop[0] >= hitX &&
                leftTop[1] <= hitY &&
                leftBottom[1] >= hitY
            ) {
                let curPositionIndex = j
                const element = elementList[j]
                // 表格被命中
                if (element.type === ElementType.TABLE) {
                    for (let t = 0; t < element.trList!.length; t++) {
                        const tr = element.trList![t]
                        for (let d = 0; d < tr.tdList.length; d++) {
                            const td = tr.tdList[d]
                            const tablePosition = this.getPositionByXY({
                                x,
                                y,
                                td,
                                pageNo: curPageNo,
                                tablePosition: positionList[j],
                                isTable: true,
                                elementList: td.value,
                                positionList: td.positionList,
                            })
                            if (~tablePosition.index) {
                                const {
                                    index: tdValueIndex,
                                    hitLineStartIndex,
                                } = tablePosition
                                const tdValueElement = td.value[tdValueIndex]
                                return {
                                    index,
                                    isCheckbox:
                                        tablePosition.isCheckbox ||
                                        tdValueElement.type ===
                                            ElementType.CHECKBOX ||
                                        tdValueElement.controlComponent ===
                                            ControlComponent.CHECKBOX,
                                    isRadio:
                                        tdValueElement.type ===
                                            ElementType.RADIO ||
                                        tdValueElement.controlComponent ===
                                            ControlComponent.RADIO,
                                    isControl: !!tdValueElement.controlId,
                                    isImage: tablePosition.isImage,
                                    isDirectHit: tablePosition.isDirectHit,
                                    isTable: true,
                                    tdIndex: d,
                                    trIndex: t,
                                    tdValueIndex,
                                    tdId: td.id,
                                    trId: tr.id,
                                    tableId: element.id,
                                    hitLineStartIndex,
                                }
                            }
                        }
                    }
                }
                // 图片区域均为命中
                if (
                    element.type === ElementType.IMAGE ||
                    element.type === ElementType.LATEX
                ) {
                    return {
                        index: curPositionIndex,
                        isDirectHit: true,
                        isImage: true,
                    }
                }
                if (
                    element.type === ElementType.CHECKBOX ||
                    element.controlComponent === ControlComponent.CHECKBOX
                ) {
                    return {
                        index: curPositionIndex,
                        isDirectHit: true,
                        isCheckbox: true,
                    }
                }
                if (
                    element.type === ElementType.RADIO ||
                    element.controlComponent === ControlComponent.RADIO
                ) {
                    return {
                        index: curPositionIndex,
                        isDirectHit: true,
                        isRadio: true,
                    }
                }
                let hitLineStartIndex: number | undefined
                // 判断是否在文字中间前后
                if (elementList[index].value !== ZERO) {
                    const valueWidth = rightTop[0] - leftTop[0]
                    if (hitX < leftTop[0] + valueWidth / 2) {
                        curPositionIndex = j - 1
                        if (isFirstLetter) {
                            hitLineStartIndex = j
                        }
                    }
                }
                return {
                    isDirectHit: true,
                    hitLineStartIndex,
                    index: curPositionIndex,
                    isControl: !!element.controlId,
                }
            }
        }
        // 验证衬于文字下方元素
        if (!isTable) {
            const floatBottomPosition = this.getFloatPositionByXY({
                ...payload,
                imgDisplays: [ImageDisplay.FLOAT_BOTTOM],
            })
            if (floatBottomPosition) return floatBottomPosition
        }
        // 非命中区域
        let isLastArea = false
        let curPositionIndex = -1
        let hitLineStartIndex: number | undefined
        // 判断是否在表格内
        if (isTable) {
            const { scale } = this.options
            const { td, tablePosition } = payload
            if (td && tablePosition) {
                const { leftTop } = tablePosition.coordinate
                const tdX = td.x! * scale + leftTop[0]
                const tdY = td.y! * scale + leftTop[1]
                const tdWidth = td.width! * scale
                const tdHeight = td.height! * scale
                if (
                    !(
                        tdX < x &&
                        x < tdX + tdWidth &&
                        tdY < y &&
                        y < tdY + tdHeight
                    )
                ) {
                    return {
                        index: curPositionIndex,
                    }
                }
            }
        }
        // 判断所属行是否存在元素
        const lastLetterList = positionList.filter(
            (p) => p.isLastLetter && p.pageNo === positionNo,
        )
        for (let j = 0; j < lastLetterList.length; j++) {
            const {
                index,
                rowNo,
                coordinate: { leftTop, leftBottom },
            } = lastLetterList[j]
            if (hitY > leftTop[1] && hitY <= leftBottom[1]) {
                const headIndex = positionList.findIndex(
                    (p) => p.pageNo === positionNo && p.rowNo === rowNo,
                )
                const headElement = elementList[headIndex]
                const headPosition = positionList[headIndex]
                // 是否在头部
                const headStartX =
                    headElement?.listStyle === ListStyle.CHECKBOX
                        ? this.options.margins[3]
                        : headPosition.coordinate.leftTop[0]
                if (hitX < headStartX) {
                    // 头部元素为空元素时无需选中
                    if (~headIndex) {
                        if (headPosition.value === ZERO) {
                            curPositionIndex = headIndex
                        } else {
                            curPositionIndex = headIndex - 1
                            hitLineStartIndex = headIndex
                        }
                    } else {
                        curPositionIndex = index
                    }
                } else {
                    // 是否是复选框列表
                    if (
                        headElement.listStyle === ListStyle.CHECKBOX &&
                        hitX < leftTop[0]
                    ) {
                        return {
                            index: headIndex,
                            isDirectHit: true,
                            isCheckbox: true,
                        }
                    }
                    curPositionIndex = index
                }
                isLastArea = true
                break
            }
        }
        if (!isLastArea) {
            // 页眉底部距离页面顶部距离
            const header = this.draw.getHeader()
            const headerHeight = header.getHeight()
            const headerBottomY = header.getHeaderTop() + headerHeight
            // 页脚上部距离页面顶部距离
            const footer = this.draw.getFooter()
            const pageHeight = this.draw.getHeight()
            const footerTopY =
                pageHeight - (footer.getFooterBottom() + footer.getHeight())
            // 判断所属位置是否属于页眉页脚区域
            if (isMainActive) {
                // 页眉：当前位置小于页眉底部位置
                if (y < headerBottomY) {
                    return {
                        index: -1,
                        zone: EditorZone.HEADER,
                    }
                }
                // 页脚：当前位置大于页脚顶部位置
                if (y > footerTopY) {
                    return {
                        index: -1,
                        zone: EditorZone.FOOTER,
                    }
                }
            } else {
                // main区域：当前位置小于页眉底部位置 && 大于页脚顶部位置
                if (y <= footerTopY && y >= headerBottomY) {
                    return {
                        index: -1,
                        zone: EditorZone.MAIN,
                    }
                }
            }
            // 正文上-循环首行
            const margins = this.draw.getMargins()
            if (y <= margins[1]) {
                for (let p = 0; p < positionList.length; p++) {
                    const position = positionList[p]
                    if (position.pageNo !== positionNo || position.rowNo !== 0)
                        continue
                    const { leftTop, rightTop } = position.coordinate
                    // 小于左页边距 || 命中文字 || 首行最后元素
                    if (
                        x <= margins[3] ||
                        (x >= leftTop[0] && x <= rightTop[0]) ||
                        positionList[p + 1]?.rowNo !== 0
                    ) {
                        return {
                            index: position.index,
                        }
                    }
                }
            } else {
                // 正文下-循环尾行
                const lastLetter = lastLetterList[lastLetterList.length - 1]
                if (lastLetter) {
                    const lastRowNo = lastLetter.rowNo
                    for (let p = 0; p < positionList.length; p++) {
                        const position = positionList[p]
                        if (
                            position.pageNo !== positionNo ||
                            position.rowNo !== lastRowNo
                        ) {
                            continue
                        }
                        const { leftTop, rightTop } = position.coordinate
                        // 小于左页边距 || 命中文字 || 尾行最后元素
                        if (
                            x <= margins[3] ||
                            (x >= leftTop[0] && x <= rightTop[0]) ||
                            positionList[p + 1]?.rowNo !== lastRowNo
                        ) {
                            return {
                                index: position.index,
                            }
                        }
                    }
                }
            }
            // 当前页最后一行
            return {
                index:
                    lastLetterList[lastLetterList.length - 1]?.index ||
                    positionList.length - 1,
            }
        }
        return {
            hitLineStartIndex,
            index: curPositionIndex,
            isControl: !!elementList[curPositionIndex]?.controlId,
        }
    }

    public getFloatPositionByXY(
        payload: IGetFloatPositionByXYPayload,
    ): ICurrentPosition | void {
        const { x, y } = payload
        const currentPageNo = payload.pageNo ?? this.draw.getPageNo()
        const currentZone = this.draw.getZone().getZone()
        for (let f = 0; f < this.floatPositionList.length; f++) {
            const {
                position,
                element,
                isTable,
                index,
                trIndex,
                tdIndex,
                tdValueIndex,
                zone: floatElementZone,
                pageNo,
            } = this.floatPositionList[f]
            if (
                currentPageNo === pageNo &&
                element.type === ElementType.IMAGE &&
                element.imgDisplay &&
                payload.imgDisplays.includes(element.imgDisplay) &&
                (!floatElementZone || floatElementZone === currentZone)
            ) {
                const imgFloatPosition = element.imgFloatPosition!
                if (
                    x >= imgFloatPosition.x &&
                    x <= imgFloatPosition.x + element.width! &&
                    y >= imgFloatPosition.y &&
                    y <= imgFloatPosition.y + element.height!
                ) {
                    if (isTable) {
                        return {
                            index: index!,
                            isDirectHit: true,
                            isImage: true,
                            isTable,
                            trIndex,
                            tdIndex,
                            tdValueIndex,
                            tdId: element.tdId,
                            trId: element.trId,
                            tableId: element.tableId,
                        }
                    }
                    return {
                        index: position.index,
                        isDirectHit: true,
                        isImage: true,
                    }
                }
            }
        }
    }

    public adjustPositionContext(
        payload: IGetPositionByXYPayload,
    ): ICurrentPosition | null {
        const positionResult = this.getPositionByXY(payload)
        if (
            payload.isTableFormulaEditing &&
            !(
                positionResult?.tdIndex ===
                    payload.oldPositionContext?.tdIndex &&
                positionResult?.trIndex === payload.oldPositionContext?.trIndex
            )
        ) {
            const {
                index,
                isCheckbox,
                isRadio,
                isControl,
                isImage,
                isDirectHit,
                isTable,
                trIndex,
                tdIndex,
                tdId,
                trId,
                tableId,
            } = payload.oldPositionContext
            this.setPositionContext({
                isTable: isTable || false,
                isCheckbox: isCheckbox || false,
                isRadio: isRadio || false,
                isControl: isControl || false,
                isImage: isImage || false,
                isDirectHit: isDirectHit || false,
                index,
                trIndex,
                tdIndex,
                tdId,
                trId,
                tableId,
            })
            return {
                ...payload.oldPositionContext,
                index: payload.oldPositionContext.index || -1,
                isTableFormulaEditing: true,
                tdValueIndex: this.draw.getPosition().cursorPosition.index,
                currentTdIndex: positionResult.tdIndex,
                currentTrIndex: positionResult.trIndex,
                currentIndex: positionResult.index,
            }
        }
        if (!~positionResult.index) return null
        // 移动控件内光标
        if (
            positionResult.isControl &&
            this.draw.getMode() !== EditorMode.READONLY
        ) {
            const { index, isTable, trIndex, tdIndex, tdValueIndex } =
                positionResult
            const control = this.draw.getControl()
            const { newIndex } = control.moveCursor({
                index,
                isTable,
                trIndex,
                tdIndex,
                tdValueIndex,
            })
            if (isTable) {
                positionResult.tdValueIndex = newIndex
            } else {
                positionResult.index = newIndex
            }
        }
        const {
            index,
            isCheckbox,
            isRadio,
            isControl,
            isImage,
            isDirectHit,
            isTable,
            trIndex,
            tdIndex,
            tdId,
            trId,
            tableId,
        } = positionResult
        positionResult.currentTdIndex = tdIndex
        positionResult.currentTrIndex = trIndex
        // 设置位置上下文
        this.setPositionContext({
            isTable: isTable || false,
            isCheckbox: isCheckbox || false,
            isRadio: isRadio || false,
            isControl: isControl || false,
            isImage: isImage || false,
            isDirectHit: isDirectHit || false,
            index,
            trIndex,
            tdIndex,
            tdId,
            trId,
            tableId,
        })
        return positionResult
    }

    public setSurroundPosition(payload: ISetSurroundPositionPayload) {
        const {
            pageNo,
            row,
            rowElement,
            rowElementRect,
            surroundElementList,
            availableWidth,
        } = payload

        let x = rowElementRect.x
        let rowIncreaseWidth = 0
        if (
            surroundElementList.length &&
            !getIsBlockElement(rowElement) &&
            !rowElement.control?.minWidth
        ) {
            for (let s = 0; s < surroundElementList.length; s++) {
                const surroundElement = surroundElementList[s]
                const floatPosition = surroundElement.imgFloatPosition!
                if (floatPosition.pageNo !== pageNo) continue
                const surroundRect = {
                    ...floatPosition,
                    width: surroundElement.width!,
                    height: surroundElement.height!,
                }
                if (isRectIntersect(rowElementRect, surroundRect)) {
                    row.isSurround = true
                    // 需向左移动距离：浮动元素宽度 + 浮动元素左上坐标 - 元素左上坐标
                    const translateX =
                        surroundRect.width + surroundRect.x - rowElementRect.x
                    rowElement.left = translateX
                    // 增加行宽
                    row.width += translateX
                    rowIncreaseWidth += translateX
                    // 下个元素起始位置：浮动元素右坐标 - 元素宽度
                    x = surroundRect.x + surroundRect.width
                    // 检测宽度是否足够，不够则移动到下一行，并还原状态
                    if (row.width + rowElement.metrics.width > availableWidth) {
                        rowElement.left = 0
                        row.width -= rowIncreaseWidth
                        break
                    }
                }
            }
        }
        return { x, rowIncreaseWidth }
    }
}
