import { useEffect, useState, type AnchorHTMLAttributes, type HTMLAttributes } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents: Components = {
    a: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="underline text-gray-600 hover:text-gray-900"
        >
            {children}
        </a>
    ),
    p: ({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
        <p {...props} className={`${className ?? ''} m-0`}>
            {children}
        </p>
    ),
};

export interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => (
    <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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

        const tokens = content.length ? content.split(/(\s+)/).filter(chunk => chunk.length > 0) : [];
        if (tokens.length === 0) {
            setVisibleText('');
            setIsComplete(true);
            onProgress?.();
            return;
        }

        setVisibleText('');
        setIsComplete(false);

        let cursor = 0;
        const timer = setInterval(() => {
            const chunk = tokens[cursor] ?? '';
            setVisibleText(prev => prev + chunk);
            onProgress?.();
            cursor += 1;
            if (cursor >= tokens.length) {
                clearInterval(timer);
                setIsComplete(true);
            }
        }, 70);

        return () => clearInterval(timer);
    }, [content, role, onProgress]);

    return <MarkdownRenderer content={isComplete ? content : visibleText} className={className} />;
};
