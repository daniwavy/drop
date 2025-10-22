'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SimpleTopbar from '@/components/SimpleTopbar';
import EzoicAd from '@/components/EzoicAd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  tags: string[];
  publishedAt: number;
  author: string;
  excerpt: string;
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/blog/posts?slug=${slug}`);
      const data = await response.json();

      if (!data.success || !data.post) {
        setError('Artikel nicht gefunden');
        return;
      }

      setPost(data.post);
    } catch (err) {
      console.error('Error loading post:', err);
      setError('Fehler beim Laden des Artikels');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const readingTime = (content: string) => {
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-black text-white">
        <SimpleTopbar />
        <div className="flex items-center justify-center py-40">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-emerald-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen w-full bg-black text-white">
        <SimpleTopbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">Oops!</h1>
          <p className="text-white/60">{error || 'Artikel nicht gefunden'}</p>
          <a href="/blog" className="inline-block mt-6 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors">
            Zurück zum Blog
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <SimpleTopbar />
      
      <article className="max-w-4xl mx-auto px-4 py-16 mt-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full">
              {post.category}
            </span>
            {post.tags && post.tags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-white/10 text-white/70 text-sm rounded-full">
                #{tag}
              </span>
            ))}
          </div>

          <h1 className="text-5xl font-bold mb-4 leading-tight">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-6 text-white/60 text-sm border-b border-white/10 pb-6">
            <span>✍️ {post.author}</span>
            <span>📅 {formatDate(post.publishedAt)}</span>
            <span>⏱️ {readingTime(post.content)} min Lesezeit</span>
          </div>
        </header>



        {/* Ezoic Ad - Header */}
        <div className="mb-8">
          <EzoicAd placementId={107} />
        </div>

        {/* Content */}
        <div className="prose prose-invert max-w-none mb-12">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({...props}) => <h1 className="text-4xl font-bold text-white mt-6 mb-4" {...props} />,
              h2: ({...props}) => <h2 className="text-2xl font-bold text-white mt-5 mb-3" {...props} />,
              h3: ({...props}) => <h3 className="text-xl font-bold text-white mt-4 mb-2" {...props} />,
              p: ({...props}) => <p className="text-white/80 leading-relaxed mb-4" {...props} />,
              ul: ({...props}) => <ul className="list-disc list-inside text-white/80 mb-4 space-y-2" {...props} />,
              ol: ({...props}) => <ol className="list-decimal list-inside text-white/80 mb-4 space-y-2" {...props} />,
              li: ({...props}) => <li className="text-white/80" {...props} />,
              strong: ({...props}) => <strong className="text-white font-semibold" {...props} />,
              em: ({...props}) => <em className="text-white/70 italic" {...props} />,
              code: ({...props}) => 
                <code className="bg-white/10 text-emerald-400 px-2 py-1 rounded text-sm" {...props} />,
              a: ({...props}) => <a className="text-emerald-400 hover:text-emerald-300 underline" {...props} />,
              blockquote: ({...props}) => <blockquote className="border-l-4 border-emerald-400 pl-4 italic text-white/70 my-4" {...props} />,
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>

        {/* Ezoic Ad - Bottom */}
        <div className="mb-12 py-8 border-t border-white/10">
          <EzoicAd placementId={108} />
        </div>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-8">
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Über den Autor</h3>
            <p className="text-white/70 text-sm">{post.author} schreibt regelmäßig über Gaming-Tipps, Tricks und Neuigkeiten auf DROP Arcade.</p>
          </div>

          <div className="mt-8 text-center">
            <a
              href="/blog"
              className="inline-block px-6 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-semibold transition-colors"
            >
              ← Zurück zum Blog
            </a>
          </div>
        </footer>
      </article>
    </div>
  );
}
