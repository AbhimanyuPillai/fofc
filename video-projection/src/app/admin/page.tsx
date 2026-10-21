"use client";

import {useEffect, useMemo, useRef, useState} from "react";

type Product = {
    id: number;
    name: string;
    category: string;
    description: string;
    modelPath: string;
    videoUrl: string;
    images: string[];
    specs: string[];
    aliases: string[];
};

export default function AdminPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState<Record<string, number>>({}); // key => progress (0-100)
    const dragOverIndex = useRef<number | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/products", {cache: "no-store"});
                const data = await res.json();
                setProducts(Array.isArray(data) ? data.map((product) => ({
                    ...product,
                    aliases: Array.isArray(product.aliases) ? product.aliases : [],
                })) : []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const setProgress = (key: string, pct: number) =>
        setUploading((prev) => ({...prev, [key]: Math.max(0, Math.min(100, Math.round(pct)))}));

    const clearProgress = (key: string) =>
        setUploading((prev) => {
            const cp = {...prev};
            delete cp[key];
            return cp;
        });

    // Low-level XHR upload to get progress events
    const xhrUpload = async (form: FormData, onProgress?: (pct: number) => void) => {
        return await new Promise<{ ok: boolean; url?: string; error?: string }>((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/upload", true);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress((e.loaded / e.total) * 100);
                }
            };
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    try {
                        const json = JSON.parse(xhr.responseText || "{}");
                        resolve({ok: xhr.status >= 200 && xhr.status < 300, url: json.url, error: json.error});
                    } catch (e) {
                        resolve({ok: false, error: "Invalid server response"});
                    }
                }
            };
            xhr.send(form);
        });
    };

    const updateField = (i: number, field: keyof Product, value: any) => {
        setProducts((prev) => {
            const copy = [...prev];
            // @ts-ignore
            copy[i] = {...copy[i], [field]: value};
            return copy;
        });
    };

    const uploadFile = async (i: number, kind: "video" | "model" | "image", file: File) => {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        const key = `${i}-${kind}-${file.name}`;
        setProgress(key, 1);
        const res = await xhrUpload(form, (p) => setProgress(key, p));
        clearProgress(key);
        if (!res.ok || !res.url) throw new Error(res.error || "Upload failed");
        if (kind === "video") updateField(i, "videoUrl", res.url);
        else if (kind === "model") updateField(i, "modelPath", res.url);
        else if (kind === "image") updateField(i, "images", [...(products[i].images || []), res.url]);
        return res.url as string;
    };

    const saveAll = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/products", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(products),
                cache: 'no-store' // Important: prevents browser caching
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Failed to save");
            setMessage("Saved successfully.");
        } catch (e: any) {
            setMessage(e?.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const addProduct = () => {
        const nextId = (products.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;
        setProducts((prev) => [
            ...prev,
            {
                id: nextId,
                name: "New Product",
                category: "",
                description: "",
                modelPath: "",
                videoUrl: "",
                images: [],
                specs: [],
                aliases: [],
            },
        ]);
    };

    const removeImage = (i: number, img: string) => {
        updateField(i, "images", products[i].images.filter((x) => x !== img));
    };

    const removeProduct = (i: number) => {
        const p = products[i];
        const ok = typeof window !== 'undefined' ? window.confirm(`Remove product #${p.id} - ${p.name}?`) : true;
        if (!ok) return;
        setProducts((prev) => prev.filter((_, idx) => idx !== i));
        setMessage(`Removed product #${p.id} (${p.name}). Don't forget to Save All.`);
    };

    if (loading) return <div className="p-6 text-cyan-300">Loading...</div>;

    return (
        <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950">
            {/* Top bar */}
            <div
                className="sticky top-0 z-20 backdrop-blur bg-black/40 border-b border-cyan-500/20 px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl md:text-2xl font-bold text-cyan-300 tracking-wide">Admin • Product & Media
                    Manager</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={addProduct}
                        className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 shadow shadow-emerald-900/40"
                    >
                        + Add Product
                    </button>
                    <button
                        onClick={saveAll}
                        disabled={saving}
                        className="px-3 py-2 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 shadow shadow-cyan-900/40"
                    >
                        {saving ? "Saving..." : "Save All"}
                    </button>
                </div>
            </div>

            {/* Global message */}
            {message && (
                <div
                    className="mx-6 mt-4 p-3 rounded border border-cyan-500/40 text-cyan-200 bg-black/40">{message}</div>
            )}

            {/* Content grid */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {products.map((p, i) => (
                    <div key={p.id}
                         className="relative rounded-xl border border-cyan-500/30 bg-gradient-to-br from-black/50 to-slate-900/60 p-5 shadow-lg shadow-black/40 space-y-4">
                        <div
                            className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent"/>
                        <div className="flex items-center justify-between">
                            <div className="text-cyan-300 font-semibold">Product #{p.id}</div>
                            <div className="flex items-center gap-2">
                                <div className="text-xs text-cyan-400/60">Images: {p.images?.length || 0}</div>
                                <button
                                    onClick={() => removeProduct(i)}
                                    className="px-2 py-1 text-xs rounded bg-red-600/90 hover:bg-red-700 text-white shadow shadow-red-900/40"
                                    title="Remove product"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <div className="text-cyan-300">ID</div>
                                <input
                                    type="number"
                                    value={p.id}
                                    onChange={(e) => updateField(i, "id", parseInt(e.target.value || "0", 10))}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                />
                            </label>
                            <label className="space-y-1">
                                <div className="text-cyan-300">Name</div>
                                <input
                                    type="text"
                                    value={p.name}
                                    onChange={(e) => updateField(i, "name", e.target.value)}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                />
                            </label>
                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Category</div>
                                <input
                                    type="text"
                                    value={p.category}
                                    onChange={(e) => updateField(i, "category", e.target.value)}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                />
                            </label>
                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Description</div>
                                <textarea
                                    value={p.description}
                                    onChange={(e) => updateField(i, "description", e.target.value)}
                                    rows={3}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-2 text-cyan-100 outline-none"
                                />
                            </label>
                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Speech aliases</div>
                                <textarea
                                    value={(p.aliases || []).join("\n")}
                                    onChange={(e) => updateField(i, "aliases", e.target.value.split(/\r?\n/).map((alias) => alias.trim()).filter(Boolean))}
                                    rows={2}
                                    placeholder="One recognized name per line"
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-2 text-cyan-100 outline-none"
                                />
                                <p className="text-xs text-cyan-400/60">Alternate names the visitor might say; enter one per line.</p>
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Model Path</div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={p.modelPath}
                                        onChange={(e) => updateField(i, "modelPath", e.target.value)}
                                        className="flex-1 bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                    />
                                    <input
                                        type="file"
                                        accept=".glb,.gltf"
                                        onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (f) {
                                                try {
                                                    const key = `${i}-model-${f.name}`;
                                                    setProgress(key, 1);
                                                    const url = await uploadFile(i, "model", f);
                                                    setMessage(`Model uploaded → ${url}`);
                                                    clearProgress(key);
                                                } catch (err: any) {
                                                    setMessage(err?.message || "Upload failed");
                                                }
                                            }
                                        }}
                                        className="text-cyan-200"
                                    />
                                </div>
                                {/* Progress bar for model upload */}
                                {Object.entries(uploading).some(([k]) => k.startsWith(`${i}-model-`)) && (
                                    <div className="mt-2 h-2 bg-slate-800/80 rounded">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded transition-all"
                                            style={{width: `${Math.max(...Object.entries(uploading).filter(([k]) => k.startsWith(`${i}-model-`)).map(([, v]) => v))}%`}}
                                        />
                                    </div>
                                )}
                            </label>

                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Video URL</div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={p.videoUrl}
                                        onChange={(e) => updateField(i, "videoUrl", e.target.value)}
                                        className="flex-1 bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                    />
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (f) {
                                                try {
                                                    const key = `${i}-video-${f.name}`;
                                                    setProgress(key, 1);
                                                    const url = await uploadFile(i, "video", f);
                                                    setMessage(`Video uploaded → ${url}`);
                                                    clearProgress(key);
                                                } catch (err: any) {
                                                    setMessage(err?.message || "Upload failed");
                                                }
                                            }
                                        }}
                                        className="text-cyan-200"
                                    />
                                </div>
                                {/* Progress bar for video upload */}
                                {Object.entries(uploading).some(([k]) => k.startsWith(`${i}-video-`)) && (
                                    <div className="mt-2 h-2 bg-slate-800/80 rounded">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded transition-all"
                                            style={{width: `${Math.max(...Object.entries(uploading).filter(([k]) => k.startsWith(`${i}-video-`)).map(([, v]) => v))}%`}}
                                        />
                                    </div>
                                )}
                            </label>
                        </div>

                        <div className="space-y-2">
                            <div className="text-cyan-300">Images</div>
                            <div className="flex items-center gap-2">
                                <label
                                    className="px-3 py-2 rounded bg-slate-800/80 border border-cyan-900/60 hover:border-cyan-500 text-cyan-200 cursor-pointer">
                                    Upload Images
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const files = Array.from(e.target.files || []);
                                            for (const f of files) {
                                                try {
                                                    const key = `${i}-image-${f.name}`;
                                                    setProgress(key, 1);
                                                    await uploadFile(i, "image", f);
                                                    clearProgress(key);
                                                } catch (err: any) {
                                                    setMessage(err?.message || "Image upload failed");
                                                }
                                            }
                                        }}
                                    />
                                </label>
                                {/* Show aggregate images upload progress if any */}
                                {Object.entries(uploading).some(([k]) => k.startsWith(`${i}-image-`)) && (
                                    <div className="flex-1 h-2 bg-slate-800/80 rounded">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded transition-all"
                                            style={{width: `${Math.max(...Object.entries(uploading).filter(([k]) => k.startsWith(`${i}-image-`)).map(([, v]) => v))}%`}}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Drag-and-drop area */}
                            <div
                                className="mt-2 border border-dashed border-cyan-700/50 rounded-md p-4 text-cyan-300/80 bg-slate-950/50 hover:border-cyan-400"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    dragOverIndex.current = i;
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    if (dragOverIndex.current !== i) return;
                                    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
                                    for (const f of files) {
                                        try {
                                            const key = `${i}-image-${f.name}`;
                                            setProgress(key, 1);
                                            await uploadFile(i, "image", f);
                                            clearProgress(key);
                                        } catch (err: any) {
                                            setMessage(err?.message || "Image upload failed");
                                        }
                                    }
                                    dragOverIndex.current = null;
                                }}
                            >
                                Drag & drop images here
                            </div>

                            <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                                {(p.images || []).map((img) => (
                                    <div key={img} className="relative group">
                                        <img src={img} alt="img"
                                             className="w-full aspect-square object-cover border border-cyan-500/30 shadow-sm"/>
                                        <div
                                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                            <a href={img} target="_blank"
                                               className="px-2 py-1 text-xs bg-cyan-600 text-white rounded">Open</a>
                                            <button
                                                onClick={() => removeImage(i, img)}
                                                className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Specs (comma separated)</div>
                                <input
                                    type="text"
                                    value={(p.specs || []).join(", ")}
                                    onChange={(e) => updateField(i, "specs", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                />
                            </label>

                            <label className="space-y-1 col-span-2">
                                <div className="text-cyan-300">Images (comma separated URLs)</div>
                                <input
                                    type="text"
                                    value={(p.images || []).join(", ")}
                                    onChange={(e) => updateField(i, "images", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                                    className="w-full bg-gray-950 border border-cyan-900/60 focus:border-cyan-500 rounded px-2 py-1 text-cyan-100 outline-none"
                                />
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            {/* Saving overlay */}
            {saving && (
                <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <div
                        className="px-6 py-4 rounded-lg border border-cyan-500/40 bg-slate-950/80 text-cyan-200 shadow-xl">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/>
                            <div>Saving changes…</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
