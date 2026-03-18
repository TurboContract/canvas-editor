import { ElementType } from '../../../..';
import { ZERO } from '../../../../dataset/constant/Common';
import { CanvasEvent } from '../../CanvasEvent';
import { IElement } from '../../../../interface/Element';

// 删除光标前隐藏元素
function backspaceHideElement(host: CanvasEvent) {
  const draw = host.getDraw()
  const rangeManager = draw.getRange()
  const range = rangeManager.getRange()
  // 光标所在位置为隐藏元素时触发循环删除
  const elementList = draw.getElementList()
  const element = elementList[range.startIndex]
  if (!element.hide && !element.control?.hide && !element.area?.hide) return
  // 向前删除所有隐藏元素
  let index = range.startIndex
  while (index > 0) {
    const element = elementList[index]
    let newIndex: number | null = null
    if (element.controlId) {
      newIndex = draw.getControl().removeControl(index)
      if (newIndex !== null) {
        index = newIndex
      }
    } else {
      draw.spliceElementList(elementList, index, 1)
      newIndex = index - 1
      index--
    }
    const newElement = elementList[newIndex!]
    if (
      !newElement ||
      (!newElement.hide && !newElement.control?.hide && !newElement.area?.hide)
    ) {
      // 更新上下文信息
      if (newIndex) {
        // 更新选区信息
        range.startIndex = newIndex
        range.endIndex = newIndex
        rangeManager.replaceRange(range)
        // 更新位置信息
        const position = draw.getPosition()
        const positionList = position.getPositionList()
        position.setCursorPosition(positionList[newIndex])
      }
      break
    }
  }
}

export function backspace(evt: KeyboardEvent, host: CanvasEvent) {
    const draw = host.getDraw();
    const elementList = draw.getElementList();
    const rangeManager = draw.getRange();
    if (!rangeManager.getIsCanInput()) return;
    const { startIndex, endIndex, isCrossRowCol } = rangeManager.getRange();
    let isNewLineDeleting = false;
    if (startIndex !== endIndex) {
        isNewLineDeleting = elementList.some(
            (elem, index) =>
                index > startIndex && index <= endIndex && elem.value === ZERO,
        );
    } else {
        isNewLineDeleting = elementList[endIndex]?.value === ZERO;
    }
    const control = draw.getControl();
    let curIndex: number | null;
    if (
        draw.isReadonly() ||
        draw.isDisabled() ||
        elementList[startIndex]?.isDisabled
    ) {
        if (
            !elementList.find(
                (el, index) =>
                    el.isPlaceholder !== undefined &&
                    index >= startIndex &&
                    index <= endIndex,
            )
        )
            return;
    }

    if (isCrossRowCol) {
        const rowCol = draw.getTableParticle().getRangeRowCol();
        if (!rowCol) return;
        let isDeleted = false;
        for (let r = 0; r < rowCol.length; r++) {
            const row = rowCol[r];
            for (let c = 0; c < row.length; c++) {
                const col = row[c];
                if (col.value.length > 1) {
                    draw.spliceElementList(col.value, 1, col.value.length - 1);
                    isDeleted = true;
                }
            }
        }
        curIndex = isDeleted ? 0 : null;
    } else if (
        control.getActiveControl() &&
        control.getIsRangeCanCaptureEvent()
    ) {
        curIndex = control.keydown(evt);
    } else {
        const position = draw.getPosition();
        const cursorPosition = position.getCursorPosition();
        if (!cursorPosition) return;
        const { index } = cursorPosition;
        const isCollapsed = rangeManager.getIsCollapsed();
        const elementList = draw.getElementList();

        const currentPageNo = cursorPosition.pageNo;
        const pageRowList = draw.getPageRowList();
        const currentPageRows = pageRowList[currentPageNo] || [];
        const footnoteRowIndexInPage = currentPageRows.findIndex((row) =>
            row.elementList.some(
                (elem) =>
                    elem.type === ElementType.SEPARATOR && elem.isFootnote,
            ),
        );
        const firstRowOnPage = currentPageRows[0];
        const firstElementIndexOnPage = firstRowOnPage
            ? firstRowOnPage.startIndex
            : 0;

        const isFirstElementOnPage = index === firstElementIndexOnPage;

        if (isCollapsed && index === 0) {
            const firstElement = elementList[index];
            if (firstElement.value === ZERO) {
                if (firstElement.listId) {
                    draw.getListParticle().unsetList();
                }
                evt.preventDefault();
                return;
            }
        }

        const currentElement = elementList[index];
        const isUnderSeparator = elementList.some(
            (el, i) =>
                el.type === ElementType.SEPARATOR && el.isFootnote && i < index,
        );
        if (
            (currentElement && currentElement.type === ElementType.SEPARATOR) ||
            (isUnderSeparator &&
                currentElement.type === ElementType.SUPERSCRIPT)
        ) {
            evt.preventDefault();
            return;
        }

        if (currentElement && currentElement.type === ElementType.SUPERSCRIPT) {
            const superscriptValue = currentElement.value;

            if (currentPageRows.length > 0) {
                const lastRow = currentPageRows[currentPageRows.length - 1];
                const pageEndIndex =
                    lastRow.startIndex + lastRow.elementList.length - 1;

                const elementsBelowOnPage = elementList.slice(
                    index + 1,
                    pageEndIndex + 1,
                );

                const footnoteSuperscriptIndexRelative =
                    elementsBelowOnPage.findIndex(
                        (elem) =>
                            elem.type === ElementType.SUPERSCRIPT &&
                            elem.value === superscriptValue &&
                            !elem.isFootnote,
                    );

                if (footnoteSuperscriptIndexRelative !== -1) {
                    const footnoteIndex =
                        index + 1 + footnoteSuperscriptIndexRelative;

                    const elementsAfterFootnote = elementList.slice(
                        footnoteIndex + 1,
                    );
                    const nextFootnoteIndexRelative =
                        elementsAfterFootnote.findIndex(
                            (elem) =>
                                elem.type === ElementType.SUPERSCRIPT &&
                                Number(elem.value) ===
                                    Number(superscriptValue) + 1 &&
                                !elem.isFootnote,
                        );
                    const deleteUntilIndex =
                        nextFootnoteIndexRelative !== -1
                            ? footnoteIndex + 1 + nextFootnoteIndexRelative
                            : elementList.length;

                    draw.spliceElementList(elementList, index, 1);
                    draw.spliceElementList(
                        elementList,
                        footnoteIndex - 1,
                        deleteUntilIndex - footnoteIndex,
                    );

                    const superscriptValueNumber = Number(superscriptValue);

                    for (const elem of elementList) {
                        if (elem.type === ElementType.SUPERSCRIPT) {
                            const elemValueNumber = Number(elem.value);
                            if (elemValueNumber > superscriptValueNumber) {
                                elem.value = String(elemValueNumber - 1);
                            }
                        }
                    }

                    const anySuperscriptsLeft = elementList.some(
                        (elem) => elem.type === ElementType.SUPERSCRIPT,
                    );

                    if (!anySuperscriptsLeft) {
                        const separatorIndex = elementList.findIndex(
                            (elem) => elem.type === ElementType.SEPARATOR,
                        );
                        if (separatorIndex !== -1) {
                            draw.spliceElementList(
                                elementList,
                                separatorIndex,
                                1,
                            );
                        }
                    }

                    curIndex = index - 1;

                    rangeManager.setRange(curIndex, curIndex);
                    draw.render({ curIndex });

                    evt.preventDefault();
                    return;
                }
            }
        }

        if (isCollapsed && isFirstElementOnPage) {
            const previousPageNo = currentPageNo - 1;
            if (previousPageNo >= 0) {
                draw.spliceElementList(elementList, index, 1);

                const updatedPageRowList = draw.getPageRowList();
                const updatedCurrentPageRows =
                    updatedPageRowList[currentPageNo] || [];
                const updatedPreviousPageRows =
                    updatedPageRowList[previousPageNo] || [];

                const separatorRowIndexInPrevPageUpdated =
                    updatedPreviousPageRows.findIndex((row) =>
                        row.elementList.some(
                            (elem) =>
                                elem.type === ElementType.SEPARATOR &&
                                elem.isFootnote,
                        ),
                    );

                if (separatorRowIndexInPrevPageUpdated !== -1) {
                    const separatorRow =
                        updatedPreviousPageRows[
                            separatorRowIndexInPrevPageUpdated
                        ];
                    const separatorElement = separatorRow.elementList.find(
                        (elem) =>
                            elem.type === ElementType.SEPARATOR &&
                            elem.isFootnote,
                    );
                    const separatorElementIndex = separatorElement
                        ? elementList.lastIndexOf(separatorElement)
                        : -1;

                    const firstRowOnCurrentPage = updatedCurrentPageRows[0];
                    const currentRowElements =
                        firstRowOnCurrentPage?.elementList || [];

                    const rowBeforeSeparator =
                        updatedPreviousPageRows[
                            separatorRowIndexInPrevPageUpdated - 1
                        ];

                    if (rowBeforeSeparator) {
                        const rowBeforeSeparatorWidth =
                            rowBeforeSeparator.width;
                        let totalWidth = 0;
                        const currentRowElementsThatCanBeMoved: IElement[] = [];

                        for (const el of currentRowElements) {
                            const elementWidth = el.metrics?.width || 0;
                            if (el.value === ZERO) continue;
                            if (
                                totalWidth + elementWidth <=
                                draw.getInnerWidth() - rowBeforeSeparatorWidth
                            ) {
                                currentRowElementsThatCanBeMoved.push(el);
                                totalWidth += elementWidth;
                            } else {
                                break;
                            }
                        }

                        if (currentRowElementsThatCanBeMoved.length > 0) {
                            const startRemoveIndex =
                                firstRowOnCurrentPage.startIndex;
                            const removeCount =
                                currentRowElementsThatCanBeMoved.length;
                            draw.spliceElementList(
                                elementList,
                                startRemoveIndex,
                                removeCount,
                            );

                            const insertIndex =
                                separatorElementIndex > -1
                                    ? separatorElementIndex
                                    : 0;

                            const isStringEmpty =
                                currentRowElementsThatCanBeMoved[0].value ===
                                    ZERO &&
                                currentRowElementsThatCanBeMoved.length === 1;
                            if (!isStringEmpty) {
                                draw.spliceElementList(
                                    elementList,
                                    insertIndex,
                                    0,
                                    currentRowElementsThatCanBeMoved,
                                );
                            }

                            curIndex = insertIndex - 1;

                            rangeManager.setRange(curIndex, curIndex);
                            draw.render({ curIndex });

                            evt.preventDefault();
                            return;
                        } else {
                            curIndex = separatorElementIndex - 1;

                            rangeManager.setRange(curIndex, curIndex);
                            draw.render({ curIndex });
                            evt.preventDefault();

                            return;
                        }
                    } else {
                        curIndex = separatorElementIndex - 1;

                        rangeManager.setRange(curIndex, curIndex);
                        draw.render({ curIndex });
                        evt.preventDefault();
                        return;
                    }
                }
            }
        }

        const separatorRowIndexInCurrentPage = currentPageRows.findIndex(
            (row) =>
                row.elementList.some(
                    (elem) =>
                        elem.type === ElementType.SEPARATOR && elem.isFootnote,
                ),
        );

        if (
            separatorRowIndexInCurrentPage !== -1 &&
            cursorPosition.rowIndex <
                currentPageRows[separatorRowIndexInCurrentPage].rowIndex
        ) {
            draw.spliceElementList(elementList, index, 1);

            draw.render({ curIndex: index - 1, isSubmitHistory: false });

            const updatedPageRowList = draw.getPageRowList();
            const nextPageRows = updatedPageRowList[currentPageNo + 1] || [];

            if (nextPageRows.length > 0) {
                const firstRowOnNextPage = nextPageRows[0];
                const firstRowElements = firstRowOnNextPage.elementList;
                let totalWidth = 0;
                const firstRowElementsThatCanBemoved: IElement[] = [];

                const rowBeforeSeparatorWidth =
                    currentPageRows[separatorRowIndexInCurrentPage - 1].width;
                for (const el of firstRowElements) {
                    const elementWidth = el.metrics?.width || 0;
                    if (el.value === ZERO) continue;
                    if (
                        totalWidth + elementWidth <=
                        draw.getInnerWidth() - rowBeforeSeparatorWidth
                    ) {
                        firstRowElementsThatCanBemoved.push(el);
                        totalWidth += elementWidth;
                    } else {
                        break;
                    }
                }

                const separatorRow =
                    currentPageRows[separatorRowIndexInCurrentPage];
                const separatorElement = separatorRow.elementList.find(
                    (elem) =>
                        elem.type === ElementType.SEPARATOR && elem.isFootnote,
                );
                const separatorElementIndex = separatorElement
                    ? elementList.lastIndexOf(separatorElement)
                    : -1;

                const startRemoveIndex = firstRowOnNextPage.startIndex;
                const removeCount = firstRowElementsThatCanBemoved.length;
                draw.spliceElementList(
                    elementList,
                    startRemoveIndex + 1,
                    removeCount,
                );

                draw.spliceElementList(
                    elementList,
                    separatorElementIndex,
                    0,
                    firstRowElementsThatCanBemoved,
                );

                curIndex = index - 1;

                rangeManager.setRange(curIndex, curIndex);
                draw.render({ curIndex });

                evt.preventDefault();
                return;
            }
        }
        const startElement = elementList[startIndex];
        if (
            isCollapsed &&
            startElement?.rowFlex &&
            startElement.value === ZERO
        ) {
            const rowFlexElementList = rangeManager.getRangeRowElementList();
            if (rowFlexElementList) {
                const preElement = elementList[startIndex - 1];
                rowFlexElementList.forEach((element) => {
                    element.rowFlex = preElement?.rowFlex;
                });
            }
        }

        if (!isCollapsed) {
            if (
                (draw.isReadonly() || draw.isDisabled()) &&
                !elementList[index]?.isPlaceholder
            ) {
                return;
            }
            draw.spliceElementList(
                elementList,
                startIndex + 1,
                endIndex - startIndex,
            );
            curIndex = startIndex;
        } else {
            const rowIndexInElementList = elementList.findLastIndex(
                (el, index) =>
                    el.listId === elementList[index].listId &&
                    el.value === ZERO &&
                    index <= endIndex,
            );
            if (
                currentElement.type === ElementType.TAB &&
                elementList[rowIndexInElementList].listLevel > 0
            ) {
                elementList[rowIndexInElementList].listLevel--;
                // draw.getListParticle().unsetList()
            }
            if (
                separatorRowIndexInCurrentPage === -1 ||
                footnoteRowIndexInPage <= cursorPosition.rowIndex
            ) {
                if (
                    (draw.isReadonly() || draw.isDisabled()) &&
                    !elementList[index]?.isPlaceholder
                ) {
                    return;
                }
                draw.spliceElementList(elementList, index, 1);
            }
            curIndex = index - 1;
            if (position.getPositionContext().isTable) {
                const { index, trIndex, tdIndex } =
                    position.getPositionContext();
                const originalElementList = draw.getOriginalElementList();
                const formulas = originalElementList[index].trList.map((row) =>
                    row.tdList.map((cell) => cell.formula),
                );
                if (
                    !originalElementList[index].trList[trIndex].tdList[tdIndex]
                        .formula
                ) {
                    formulas.forEach((tr, trIndex) =>
                        tr.forEach((td, tdIndex) => {
                            if (!td) return;
                            const elementList =
                                originalElementList[index].trList[trIndex]
                                    .tdList[tdIndex].value;
                            draw.calculateFormula(
                                elementList,
                                index,
                                true,
                                trIndex,
                                tdIndex,
                                true,
                            );
                        }),
                    );
                }
            }
        }
    }
    if (isNewLineDeleting) {
        let index = curIndex ? curIndex : startIndex;
        while (
            elementList[index]?.value !== ZERO &&
            index < elementList.length
        ) {
            elementList[index].id = elementList[startIndex - 1].id;
            index += 1;
        }
    }
    draw.getGlobalEvent().setCanvasEventAbility();
    if (curIndex === null) {
        rangeManager.setRange(startIndex, startIndex);
        draw.render({
            curIndex: startIndex,
            isSubmitHistory: false,
        });
    } else {
        rangeManager.setRange(curIndex, curIndex);
        draw.render({
            curIndex,
        });
    }
}
