import { EditorMode, EditorZone } from '../../../../dataset/enum/Editor'
import { KeyMap } from '../../../../dataset/enum/KeyMap'
import { TextOrientation } from '../../../../dataset/enum/table/TextOrientation'
import { isMod } from '../../../../utils/hotkey'
import { CanvasEvent } from '../../CanvasEvent'
import { backspace } from './backspace'
import { del } from './delete'
import { enter } from './enter'
import { left } from './left'
import { right } from './right'
import { tab } from './tab'
import { updown } from './updown'

export function keydown(evt: KeyboardEvent, host: CanvasEvent) {
    if (host.isComposing) return
    const draw = host.getDraw()
    const tdOrientation =
        draw.getTd()?.textOrientation ?? TextOrientation.HORIZONTAL
    const isVerticalCellText = tdOrientation !== TextOrientation.HORIZONTAL
    // 键盘事件逻辑分发
    if (evt.key === KeyMap.Backspace) {
        backspace(evt, host)
    } else if (evt.key === KeyMap.Delete) {
        del(evt, host)
    } else if (evt.key === KeyMap.Enter) {
        enter(evt, host)
    } else if (evt.key === KeyMap.Left) {
        if (isVerticalCellText) {
            // For vertical text, horizontal arrow keys should move by visual rows.
            const updownKey =
                tdOrientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM
                    ? KeyMap.Up
                    : KeyMap.Down
            updown(evt, host, updownKey)
        } else {
            left(evt, host)
        }
    } else if (evt.key === KeyMap.Right) {
        if (isVerticalCellText) {
            const updownKey =
                tdOrientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM
                    ? KeyMap.Down
                    : KeyMap.Up
            updown(evt, host, updownKey)
        } else {
            right(evt, host)
        }
    } else if (evt.key === KeyMap.Up || evt.key === KeyMap.Down) {
        if (isVerticalCellText) {
            const isUp = evt.key === KeyMap.Up
            const moveToRight =
                tdOrientation === TextOrientation.VERTICAL_TOP_TO_BOTTOM
                    ? isUp
                    : !isUp
            moveToRight ? right(evt, host) : left(evt, host)
        } else {
            updown(evt, host)
        }
    } else if (isMod(evt) && evt.key === KeyMap.Z) {
        if (draw.isReadonly() && draw.getMode() !== EditorMode.FORM) return
        draw.getHistoryManager().undo()
        evt.preventDefault()
    } else if (isMod(evt) && evt.key === KeyMap.Y) {
        if (draw.isReadonly() && draw.getMode() !== EditorMode.FORM) return
        draw.getHistoryManager().redo()
        evt.preventDefault()
    } else if (isMod(evt) && evt.key === KeyMap.C) {
        host.copy()
        evt.preventDefault()
    } else if (isMod(evt) && evt.key === KeyMap.X) {
        host.cut()
        evt.preventDefault()
    } else if (isMod(evt) && evt.key === KeyMap.A) {
        host.selectAll()
        evt.preventDefault()
    } else if (isMod(evt) && evt.key === KeyMap.S) {
        if (draw.isReadonly()) return
        const listener = draw.getListener()
        if (listener.saved) {
            listener.saved(draw.getValue())
        }
        const eventBus = draw.getEventBus()
        if (eventBus.isSubscribe('saved')) {
            eventBus.emit('saved', draw.getValue())
        }
        evt.preventDefault()
    } else if (evt.key === KeyMap.ESC) {
        // 退出格式刷
        host.clearPainterStyle()
        // 退出页眉页脚编辑
        const zoneManager = draw.getZone()
        if (!zoneManager.isMainActive()) {
            zoneManager.setZone(EditorZone.MAIN)
        }
        evt.preventDefault()
    } else if (evt.key === KeyMap.TAB) {
        tab(evt, host)
    }
}
