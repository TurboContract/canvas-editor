import { DeepRequired } from '../../../interface/Common';
import { IEditorOption } from '../../../interface/Editor';
import { IRowElement } from '../../../interface/Row';
import { Draw } from '../Draw';

export class TabSymbolParticle {
    private options: DeepRequired<IEditorOption>;
    public static readonly WIDTH = 12;
    public static readonly HEIGHT = 12;
    public static readonly GAP = 3; // 距离左边间隙

    constructor(draw: Draw) {
        this.options = draw.getOptions();
    }

    public render(
        ctx: CanvasRenderingContext2D,
        element: IRowElement,
        x: number,
        y: number,
    ) {
        const {
            scale,
            lineBreak: { color, lineWidth },
        } = this.options;
        ctx.save();
        ctx.beginPath();
        const top = y - (TabSymbolParticle.HEIGHT * scale) / 2;
        const left = x + 10 * scale;
        ctx.translate(left, top);
        ctx.scale(scale, scale);
        ctx.strokeStyle = '#004999';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, TabSymbolParticle.HEIGHT / 2);
        ctx.lineTo(10, TabSymbolParticle.HEIGHT / 2);
        ctx.moveTo(10, TabSymbolParticle.HEIGHT / 2);
        ctx.lineTo(7, TabSymbolParticle.HEIGHT / 2 - 3);
        ctx.moveTo(10, TabSymbolParticle.HEIGHT / 2);
        ctx.lineTo(7, TabSymbolParticle.HEIGHT / 2 + 3);
        ctx.stroke();
        ctx.closePath();
        ctx.restore();
    }
}
