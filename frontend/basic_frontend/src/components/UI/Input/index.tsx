import inputStyle from "./style.scss"

export interface InputProps {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    label?: string;
    style?: React.CSSProperties;
    className?: string;
}

const Input: React.FC<InputProps> = ({value, placeholder, onChange, label, style, className}) => {
    return (
        <div className={inputStyle.inputContainer}>
            {label && <label className={inputStyle.inputLabel}>{label}</label>}
            <input
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange && onChange(e.target.value)}
                style={style}
                className={`${inputStyle.inputField} ${className ?? ""}`.trim()}
            />
        </div>
    );
};

export default Input;