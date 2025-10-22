import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

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
  thumbnail?: string;
}

async function loadPost(slug: string): Promise<BlogPost | null> {
  try {
    const blogsDir = path.join(process.cwd(), 'public', 'blog');
    const filePath = path.join(blogsDir, `${slug}.md`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    const title = data.title || content.split('\n')[0]?.replace(/^#+\s*/, '');
    const excerpt = data.excerpt || content.split('\n\n')[1] || '';

    return {
      id: slug,
      title: title || 'Untitled',
      slug: slug,
      content: content,
      category: data.category || 'Allgemein',
      tags: data.tags || [],
      publishedAt: data.publishedAt || 0,
      author: data.author || 'DROP Team',
      excerpt: excerpt.substring(0, 150),
      thumbnail: data.thumbnail || undefined
    };
  } catch {
    return null;
  }
}

async function loadAllPosts(): Promise<BlogPost[]> {
  try {
    const blogsDir = path.join(process.cwd(), 'public', 'blog');
    
    if (!fs.existsSync(blogsDir)) {
      return [];
    }

    const files = fs.readdirSync(blogsDir).filter((f: string) => f.endsWith('.md'));
    const posts: BlogPost[] = [];

    files.forEach((file: string) => {
      const filePath = path.join(blogsDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContent);

      const title = data.title || content.split('\n')[0]?.replace(/^#+\s*/, '');
      const excerpt = data.excerpt || content.split('\n\n')[1] || '';

      posts.push({
        id: file.replace('.md', ''),
        title: title || 'Untitled',
        slug: file.replace('.md', ''),
        content: content,
        category: data.category || 'Allgemein',
        tags: data.tags || [],
        publishedAt: data.publishedAt || 0,
        author: data.author || 'DROP Team',
        excerpt: excerpt.substring(0, 150),
        thumbnail: data.thumbnail || undefined
      });
    });

    posts.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return posts;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (slug) {
      // Load single post
      const post = await loadPost(slug);
      if (!post) {
        return Response.json({ success: false, post: null }, { status: 404 });
      }
      return Response.json({ success: true, post });
    }

    // Load all posts
    const posts = await loadAllPosts();
    return Response.json({ success: true, posts });
  } catch (error) {
    console.error('Error loading blog posts:', error);
    return Response.json({ success: false, error: 'Failed to load posts' }, { status: 500 });
  }
}
