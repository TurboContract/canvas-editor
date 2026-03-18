export enum ControlType {
    TEXT = 'text',
    SELECT = 'select',
    CHECKBOX = 'checkbox',
    RADIO = 'radio',
    DATE = 'date',
}

export enum ControlComponent {
    PREFIX = 'prefix',
    POSTFIX = 'postfix',
    PLACEHOLDER = 'placeholder',
    VALUE = 'value',
    CHECKBOX = 'checkbox',
    RADIO = 'radio',
}

// 控件内容缩进方式
export enum ControlIndentation {
    ROW_START = 'rowStart', // 从行起始位置缩进
    VALUE_START = 'valueStart', // 从值起始位置缩进
}

// 数值控件计算器按钮类型
export enum CalculatorButtonType {
  NUMBER = 'number',
  OPERATOR = 'operator',
  UTILITY = 'utility',
  EQUAL = 'equal'
}