import * as Tooltip from "@radix-ui/react-tooltip";
import styles from "./TooltipWrapper.module.css";
import React from "react";

type Props = React.PropsWithChildren<{
    text: string,
    className?: string,
    onClick?: React.MouseEventHandler<HTMLDivElement>,
}>;

const TooltipWrapper: React.FC<Props> = ({ children, text, className, onClick }: Props) => {
    return <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
            <Tooltip.Trigger asChild>
                <div className={className} onClick={onClick}>
                    {children}
                </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content className={styles.TooltipContent}>
                    {text}
                    <Tooltip.Arrow className={styles.TooltipArrow} />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    </Tooltip.Provider>;
};

export default TooltipWrapper;