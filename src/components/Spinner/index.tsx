import styles from "./Spinner.module.css";

interface SpinnerProps {
    size?: number;
    color?: string;
    className?: string;
}

// eslint-disable-next-line react/prop-types
const Spinner: React.FC<SpinnerProps> = ({ size = 16, color = "currentColor", className }) => {
    return <span
        className={`${styles.spinner} ${className ?? ""}`}
        style={{
            width: size,
            height: size,
            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
            borderTopColor: color,
        }}
    />;
};

export default Spinner;
