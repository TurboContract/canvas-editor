import { DeepRequired } from '../../../interface/Common';
import { IEditorOption } from '../../../interface/Editor';
import { IRowElement } from '../../../interface/Row';
import { Draw } from '../Draw';

export class ParagraphSymbolParticle {
    private options: DeepRequired<IEditorOption>;
    public static readonly WIDTH = 12;
    public static readonly HEIGHT = 12;
    public static readonly GAP = 3;

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
        const top = y - (ParagraphSymbolParticle.HEIGHT * scale) / 2;
        const left = x + 10 * scale;
        ctx.translate(left, top);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#004999';
        ctx.font = `${12 * scale}px Arial`;
        ctx.fillText('¶', 0, ParagraphSymbolParticle.HEIGHT / 2);
        ctx.restore();
    }
}
