import { IAreaBadge, IBadge } from '../../../interface/Badge'
import { DeepRequired } from '../../../interface/Common'
import { IEditorOption } from '../../../interface/Editor'
import { defaultBadgeOption } from '../../../dataset/constant/Badge'
import { Draw } from '../Draw'

export class Badge {
  private draw: Draw
  private options: DeepRequired<IEditorOption>
  private imageCache: Map<string, HTMLImageElement>
  private mainBadge: IBadge | null
  private areaBadgeMap: Map<string, IBadge>

  constructor(draw: Draw) {
    this.draw = draw
    this.options = draw.getOptions()
    this.imageCache = new Map()
    this.mainBadge = null
    this.areaBadgeMap = new Map()
  }

  public setMainBadge(payload: IBadge | null) {
    this.mainBadge = payload
  }

  public setAreaBadgeMap(payload: IAreaBadge[]) {
    this.areaBadgeMap.clear()
    payload.forEach(areaBadge => {
      this.areaBadgeMap.set(areaBadge.areaId, areaBadge.badge)
    })
  }

  private _drawImage(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    value: string
  ) {
    if (this.imageCache.has(value)) {
      const img = this.imageCache.get(value)!
      ctx.drawImage(img, x, y, width, height)
    } else {
      const img = new Image()
      img.setAttribute('crossOrigin', 'Anonymous')
      img.src = value
      img.onload = () => {
        this.imageCache.set(value, img)
        ctx.drawImage(img, x, y, width, height)
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, pageNo: number) {
    const { scale } = this.options
    const { left: defaultLeft, top: defaultTop } = defaultBadgeOption
    // 文档签章
    if (pageNo === 0 && this.mainBadge) {
      const { left, top, width, height, value } = this.mainBadge
      // 默认从页眉下开始
      const headerTop =
        this.draw.getMargins()[0] + this.draw.getHeader().getExtraHeight()
      const x = (left ?? defaultLeft) * scale
      const y = (top ?? defaultTop) * scale + headerTop
      this._drawImage(ctx, x, y, width * scale, height * scale, value)
    }
    // 区域签章
    if (this.areaBadgeMap.size) {
      // Draw no longer exposes `getArea()`, compute each area's first position
      // from the main element/position lists.
      const elementList = this.draw.getOriginalMainElementList()
      const positionList = this.draw.getPosition().getOriginalMainPositionList()
      const firstPositionMap = new Map<string, (typeof positionList)[number]>()
      const maxIndex = Math.min(elementList.length, positionList.length)
      for (let i = 0; i < maxIndex; i++) {
        const areaId = elementList[i]?.areaId
        if (!areaId || firstPositionMap.has(areaId)) continue
        firstPositionMap.set(areaId, positionList[i])
      }

      if (firstPositionMap.size) {
        for (const [areaId, badgeItem] of this.areaBadgeMap) {
          const firstPosition = firstPositionMap.get(areaId)
          // 忽略非本页区域/未找到区域定位信息
          if (!firstPosition || firstPosition.pageNo !== pageNo) continue
          const { left, top, width, height, value } = badgeItem
          const x = (left ?? defaultLeft) * scale
          const y = (top ?? defaultTop) * scale + firstPosition.coordinate.leftTop[1]
          this._drawImage(ctx, x, y, width * scale, height * scale, value)
        }
      }
    }
  }
}
