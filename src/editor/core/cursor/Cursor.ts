import { CURSOR_AGENT_OFFSET_HEIGHT } from '../../dataset/constant/Cursor'
import { EDITOR_PREFIX } from '../../dataset/constant/Editor'
import { MoveDirection } from '../../dataset/enum/Observer'
import { TextOrientation } from '../../dataset/enum/table/TextOrientation'
import { DeepRequired } from '../../interface/Common'
import { ICursorOption } from '../../interface/Cursor'
import { IEditorOption } from '../../interface/Editor'
import { IElementPosition } from '../../interface/Element'
import { findScrollContainer } from '../../utils'
import { Draw } from '../draw/Draw'
import { CanvasEvent } from '../event/CanvasEvent'
import { Position } from '../position/Position'
import { CursorAgent } from './CursorAgent'

export type IDrawCursorOption = ICursorOption & {
    isShow?: boolean;
    isBlink?: boolean;
    isFocus?: boolean;
    hitLineStartIndex?: number;
};

export interface IMoveCursorToVisibleOption {
    direction: MoveDirection;
    cursorPosition: IElementPosition;
}

export class Cursor {
    /** Green debug rect around cursor text box; set `true` only while debugging layout. */
    private static readonly DEBUG_CURSOR_RECT_ENABLED = false

    private readonly ANIMATION_CLASS = `${EDITOR_PREFIX}-cursor--animation`
    private readonly DEBUG_RECT_CLASS = `${EDITOR_PREFIX}-cursor-debug-rect`

    private draw: Draw
    private container: HTMLDivElement
    private options: DeepRequired<IEditorOption>
    private position: Position
    private cursorDom: HTMLDivElement
    private cursorDebugRectDom: HTMLDivElement
    private cursorAgent: CursorAgent
    private blinkTimeout: number | null

    constructor(draw: Draw, canvasEvent: CanvasEvent) {
        this.draw = draw
        this.container = draw.getContainer()
        this.position = draw.getPosition()
        this.options = draw.getOptions()

        this.cursorDom = document.createElement('div')
        this.cursorDom.classList.add(`${EDITOR_PREFIX}-cursor`)
        this.container.append(this.cursorDom)

        this.cursorDebugRectDom = document.createElement('div')
        this.cursorDebugRectDom.classList.add(this.DEBUG_RECT_CLASS)
        this.cursorDebugRectDom.style.position = 'absolute'
        this.cursorDebugRectDom.style.pointerEvents = 'none'
        this.cursorDebugRectDom.style.backgroundColor = 'rgba(34, 197, 94, 0.2)'
        this.cursorDebugRectDom.style.border = '1px solid rgba(34, 197, 94, 0.6)'
        this.cursorDebugRectDom.style.display = 'none'
        this.container.append(this.cursorDebugRectDom)

        this.cursorAgent = new CursorAgent(draw, canvasEvent)
        this.blinkTimeout = null
    }

    public getCursorDom(): HTMLDivElement {
        return this.cursorDom
    }

    public getAgentDom(): HTMLTextAreaElement {
        return this.cursorAgent.getAgentCursorDom()
    }

    public getAgentIsActive(): boolean {
        return this.getAgentDom() === document.activeElement
    }

    public getAgentDomValue(): string {
        return this.getAgentDom().value
    }

    public clearAgentDomValue() {
        this.getAgentDom().value = ''
    }

    private _blinkStart() {
        this.cursorDom.classList.add(this.ANIMATION_CLASS)
    }

    private _blinkStop() {
        this.cursorDom.classList.remove(this.ANIMATION_CLASS)
    }

    private _setBlinkTimeout() {
        this._clearBlinkTimeout()
        this.blinkTimeout = window.setTimeout(() => {
            this._blinkStart()
        }, 500)
    }

    private _clearBlinkTimeout() {
        if (this.blinkTimeout) {
            this._blinkStop()
            window.clearTimeout(this.blinkTimeout)
            this.blinkTimeout = null
        }
    }

    public drawCursor(payload?: IDrawCursorOption) {
        let cursorPosition = this.position.getCursorPosition()
        if (!cursorPosition) return
        const { scale, cursor } = this.options
        const {
            color,
            width,
            isShow = true,
            isBlink = true,
            isFocus = true,
            hitLineStartIndex,
        } = { ...cursor, ...payload }
        // 设置光标代理
        const height = this.draw.getHeight()
        const pageGap = this.draw.getPageGap()
        // 光标位置
        if (hitLineStartIndex) {
            const positionList = this.position.getPositionList()
            cursorPosition = positionList[hitLineStartIndex]
        }
        const {
            metrics,
            coordinate: { leftTop, leftBottom, rightTop, rightBottom },
            ascent,
            pageNo,
            index,
        } = cursorPosition
        const elementList = this.draw.getElementList()
        const isPlaceholder = elementList[index]?.isPlaceholder ?? false
        const isDisabled = elementList[index]?.isDisabled ?? false
        const zoneManager = this.draw.getZone()
        const curPageNo = zoneManager.isMainActive()
            ? pageNo
            : this.draw.getPageNo()
        const preY = curPageNo * (height + pageGap)
        // 默认偏移高度
        const defaultOffsetHeight = CURSOR_AGENT_OFFSET_HEIGHT * scale
        // 增加1/4字体大小（最小为defaultOffsetHeight即默认偏移高度）
        const increaseHeight = Math.min(
            metrics.height / 4,
            defaultOffsetHeight,
        )
        const cursorHeight = metrics.height + increaseHeight * 2
        const agentCursorDom = this.cursorAgent.getAgentCursorDom()
        if (isFocus) {
            setTimeout(() => {
                // 光标不聚焦时重新定位
                if (document.activeElement !== agentCursorDom) {
                    agentCursorDom.focus()
                    agentCursorDom.setSelectionRange(0, 0)
                }
            })
        }
        // fillText位置 + 文字基线到底部距离 - 模拟光标偏移量
        const descent =
            metrics.boundingBoxDescent < 0 ? 0 : metrics.boundingBoxDescent
        const cursorTop =
            leftTop[1] +
            ascent +
            descent -
            (cursorHeight - increaseHeight) +
            preY
        const cursorLeft = hitLineStartIndex ? leftTop[0] : rightTop[0]

        // Для вертикального текста меняем только позицию каретки
        // по той же матрице, что используется в `Draw.ts`.
        // Сам DOM-курсор не вращаем, чтобы не влиять на его внешний вид.
        let cursorDomLeft = cursorLeft
        let cursorDomTop = cursorTop
        const cursorDomTransform = 'none'
        const cursorDomTransformOrigin = '0 0'

        const td = this.draw.getTd()
        const tdOrientation = td?.textOrientation ?? TextOrientation.HORIZONTAL
        const positionContext = this.position.getPositionContext()
        const pageCursor =
            positionContext.isTable &&
            tdOrientation !== TextOrientation.HORIZONTAL
                ? 'vertical-text'
                : 'text'
        this.draw.getPageList().forEach((page) => {
            page.style.cursor = pageCursor
        })

        const cursorDomWidth = width * scale
        const cursorDomHeight = cursorHeight
        let visualCursorWidth = cursorDomWidth
        let visualCursorHeight = cursorDomHeight
        let visualCursorLeft = cursorDomLeft
        let visualCursorTop = cursorDomTop
        let textRectLeft = Math.min(leftTop[0], leftBottom[0])
        let textRectTop = Math.min(leftTop[1], rightTop[1]) + preY
        let textRectRight = Math.max(rightTop[0], rightBottom[0])
        let textRectBottom = Math.max(leftBottom[1], rightBottom[1]) + preY

        if (
            positionContext.isTable &&
            positionContext.index !== undefined &&
            tdOrientation !== TextOrientation.HORIZONTAL &&
            td &&
            td.x !== undefined &&
            td.y !== undefined
        ) {
            const tablePosition =
                this.position.getOriginalPositionList()[positionContext.index]
            const tableLeftTop = tablePosition?.coordinate.leftTop

            if (tableLeftTop) {
                const tdX = td.x * scale + tableLeftTop[0]
                const tdY = td.y * scale + tableLeftTop[1] + preY
                const tdW = (td.width ?? 0) * scale
                const px = cursorDomLeft
                const py = cursorDomTop

                if (
                    tdOrientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM
                ) {
                    cursorDomLeft = py + (tdX - tdY)
                    cursorDomTop = -px + (tdY + tdX + tdW)
                } else if (
                    tdOrientation === TextOrientation.VERTICAL_BOTTOM_TO_TOP
                ) {
                    cursorDomLeft = -py + (tdX + tdY)
                    cursorDomTop = px + (tdY - tdX)
                }
                // In vertical text mode the caret should be horizontal on screen.
                visualCursorWidth = cursorDomHeight
                visualCursorHeight = cursorDomWidth
                visualCursorLeft =
                    tdOrientation === TextOrientation.VERTICAL_BOTTOM_TO_TOP
                        ? cursorDomLeft - visualCursorWidth
                        : cursorDomLeft
                visualCursorTop = cursorDomTop - visualCursorHeight / 2

                const textRectCorners: Array<[number, number]> = [
                    [textRectLeft, textRectTop],
                    [textRectRight, textRectTop],
                    [textRectLeft, textRectBottom],
                    [textRectRight, textRectBottom],
                ]
                const transformedCorners = textRectCorners.map(([x, y]) => {
                    if (
                        tdOrientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM
                    ) {
                        return [y + (tdX - tdY), -x + (tdY + tdX + tdW)] as [
                            number,
                            number,
                        ]
                    }
                    return [-y + (tdX + tdY), x + (tdY - tdX)] as [
                        number,
                        number,
                    ]
                })
                const xList = transformedCorners.map(([x]) => x)
                const yList = transformedCorners.map(([, y]) => y)
                textRectLeft = Math.min(...xList)
                textRectRight = Math.max(...xList)
                textRectTop = Math.min(...yList)
                textRectBottom = Math.max(...yList)
            }
        }
        const cursorDebugRectWidth = Math.max(textRectRight - textRectLeft, 1)
        const cursorDebugRectHeight = Math.max(textRectBottom - textRectTop, 1)

        agentCursorDom.style.left = `${cursorDomLeft}px`
        agentCursorDom.style.top = `${
            cursorDomTop + cursorDomHeight - defaultOffsetHeight
        }px`
        // 模拟光标显示
        if (!isShow) {
            this.recoveryCursor()
            return
        }
        const isReadonly = this.draw.isReadonly()
        this.cursorDom.style.width = `${cursorDomWidth}px`
        this.cursorDom.style.backgroundColor = color
        this.cursorDom.style.transform = cursorDomTransform
        this.cursorDom.style.transformOrigin = cursorDomTransformOrigin
        this.cursorDom.style.left = `${visualCursorLeft}px`
        this.cursorDom.style.top = `${visualCursorTop}px`
        this.cursorDom.style.display = isPlaceholder
            ? 'block'
            : isReadonly || isDisabled
              ? 'none'
              : 'block'
        this.cursorDom.style.width = `${visualCursorWidth}px`
        this.cursorDom.style.height = `${visualCursorHeight}px`
        this.cursorDebugRectDom.style.transform = 'none'
        this.cursorDebugRectDom.style.transformOrigin = '0 0'
        this.cursorDebugRectDom.style.left = `${textRectLeft}px`
        this.cursorDebugRectDom.style.top = `${textRectTop}px`
        this.cursorDebugRectDom.style.width = `${cursorDebugRectWidth}px`
        this.cursorDebugRectDom.style.height = `${cursorDebugRectHeight}px`
        this.cursorDebugRectDom.style.display =
            Cursor.DEBUG_CURSOR_RECT_ENABLED &&
            (isPlaceholder || (!isReadonly && !isDisabled))
                ? 'block'
                : 'none'
        if (isBlink) {
            this._setBlinkTimeout()
        } else {
            this._clearBlinkTimeout()
        }
    }

    public recoveryCursor() {
        this.cursorDom.style.display = 'none'
        this.cursorDebugRectDom.style.display = 'none'
        this._clearBlinkTimeout()
    }

    public moveCursorToVisible(payload: IMoveCursorToVisibleOption) {
        const { cursorPosition, direction } = payload
        if (!cursorPosition || !direction) return
        const {
            pageNo,
            coordinate: { leftTop, leftBottom },
        } = cursorPosition
        // 当前页面距离滚动容器顶部距离
        const prePageY =
            pageNo * (this.draw.getHeight() + this.draw.getPageGap()) +
            this.container.getBoundingClientRect().top
        // 向上移动时：以顶部距离为准，向下移动时：以底部位置为准
        const isUp = direction === MoveDirection.UP
        const x = leftBottom[0]
        const y = isUp ? leftTop[1] + prePageY : leftBottom[1] + prePageY
        // 查找滚动容器，如果是滚动容器是document，则限制范围为当前窗口
        const scrollContainer = findScrollContainer(this.container)
        const rect = {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        }
        if (scrollContainer === document.documentElement) {
            rect.right = window.innerWidth
            rect.bottom = window.innerHeight
        } else {
            const { left, right, top, bottom } =
                scrollContainer.getBoundingClientRect()
            rect.left = left
            rect.right = right
            rect.top = top
            rect.bottom = bottom
        }
        // 可视范围根据参数调整
        const { maskMargin } = this.options
        rect.top += maskMargin[0]
        rect.bottom -= maskMargin[2]
        // 不在可视范围时，移动滚动条到合适位置
        if (
            !(
                x >= rect.left &&
                x <= rect.right &&
                y >= rect.top &&
                y <= rect.bottom
            )
        ) {
            const { scrollLeft, scrollTop } = scrollContainer
            isUp
                ? scrollContainer.scroll(scrollLeft, scrollTop - (rect.top - y))
                : scrollContainer.scroll(
                      scrollLeft,
                      scrollTop + y - rect.bottom,
                  )
        }
    }
}
