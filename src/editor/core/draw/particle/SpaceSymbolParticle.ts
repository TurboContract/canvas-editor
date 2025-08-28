import { DeepRequired } from '../../../interface/Common';
import { IEditorOption } from '../../../interface/Editor';
import { IRowElement } from '../../../interface/Row';
import { Draw } from '../Draw';

export class SpaceSymbolParticle {
    private options: DeepRequired<IEditorOption>;

    constructor(draw: Draw) {
        this.options = draw.getOptions();
    }

    public render(
        ctx: CanvasRenderingContext2D,
        element: IRowElement,
        x: number,
        y: number,
    ) {
        const { scale } = this.options;
        ctx.save();
        ctx.beginPath();
        const top = y;
        const left = x + 2 * scale;
        ctx.translate(left, top);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#004999';
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.restore();
    }
}
