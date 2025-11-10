import { useEffect, useState, type AnchorHTMLAttributes, type HTMLAttributes } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MAX_ANIMATION_STEPS = 160;

const tokenizeForAnimation = (text: string): string[] => {
    if (!text) {
        return [];
    }
    const rawTokens = text.split(/(\s+)/).filter(Boolean);
    return rawTokens.reduce<string[]>((chunks, part) => {
        if (/^\s+$/.test(part) && chunks.length > 0) {
            chunks[chunks.length - 1] += part;
        } else {
            chunks.push(part);
        }
        return chunks;
    }, []);
};

const animationIntervalForLength = (length: number) => {
    if (length < 120) return 45;
    if (length < 400) return 28;
    return 18;
};

const markdownComponents: Components = {
    a: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-100 underline decoration-neutral-700 underline-offset-4 hover:text-white"
        >
            {children}
        </a>
    ),
    p: ({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
        <p {...props} className={`${className ?? ''} m-0 text-neutral-100`}>
            {children}
        </p>
    ),
    code: ({ children, className, ...props }: HTMLAttributes<HTMLElement>) => (
        <code
            {...props}
            className={`${className ?? ''} rounded bg-white/10 px-1 py-0.5 text-neutral-100`}
        >
            {children}
        </code>
    ),
};

export interface MarkdownRendererProps {
    content: string;
    className?: string;
    components?: Components;
}

export const MarkdownRenderer = ({ content, className, components }: MarkdownRendererProps) => (
    <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components ?? markdownComponents}>
            {content}
        </ReactMarkdown>
    </div>
);

interface AnimatedMessageProps {
    content: string;
    role: 'assistant' | 'user';
    className?: string;
    onProgress?: () => void;
}

export const AnimatedMessage = ({
    content,
    role,
    className,
    onProgress,
}: AnimatedMessageProps) => {
    const [visibleText, setVisibleText] = useState(role === 'assistant' ? '' : content);
    const [isComplete, setIsComplete] = useState(role !== 'assistant');

    useEffect(() => {
        if (role !== 'assistant') {
            setVisibleText(content);
            setIsComplete(true);
            return;
        }

        const tokens = tokenizeForAnimation(content);
        if (tokens.length === 0) {
            setVisibleText('');
            setIsComplete(true);
            onProgress?.();
            return;
        }

        setVisibleText('');
        setIsComplete(false);

        let cursor = 0;
        const chunkSize = Math.max(1, Math.ceil(tokens.length / MAX_ANIMATION_STEPS));
        const intervalDelay = animationIntervalForLength(content.length);
        const timer = window.setInterval(() => {
            const nextChunk = tokens.slice(cursor, cursor + chunkSize).join('');
            setVisibleText(prev => prev + nextChunk);
            onProgress?.();
            cursor += chunkSize;
            if (cursor >= tokens.length) {
                window.clearInterval(timer);
                setVisibleText(content);
                setIsComplete(true);
            }
        }, intervalDelay);

        return () => window.clearInterval(timer);
    }, [content, role, onProgress]);

    return <MarkdownRenderer content={isComplete ? content : visibleText} className={className} />;
};
