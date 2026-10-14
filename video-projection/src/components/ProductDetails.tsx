'use client';

import { motion } from 'framer-motion';
import { X, Zap, Cpu, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ProductDetailsProps {
  product: {
    id: number;
    name: string;
    category: string;
    description: string;
    modelPath: string;
    videoUrl: string;
    images: string[];
    specs: string[];
  };
  onClose: () => void;
}

export default function ProductDetails({ product, onClose }: ProductDetailsProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="bg-gradient-to-br from-slate-900/90 to-purple-900/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              {product.name}
            </h2>
            <p className="text-cyan-300 text-lg mt-1">{product.category}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-cyan-500/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-cyan-400" />
          </button>
        </div>

        {/* Description */}
        <div className="mb-6">
          <h3 className="text-cyan-400 font-semibold text-lg mb-3 flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Description
          </h3>
          <p className="text-gray-300 leading-relaxed">{product.description}</p>
        </div>

        {/* Specifications */}
        {/*<div className="mb-6">*/}
        {/*  <h3 className="text-cyan-400 font-semibold text-lg mb-3 flex items-center">*/}
        {/*    <Cpu className="w-5 h-5 mr-2" />*/}
        {/*    Specifications*/}
        {/*  </h3>*/}
        {/*  <div className="grid grid-cols-1 gap-3">*/}
        {/*    {product.specs.map((spec, index) => (*/}
        {/*      <motion.div*/}
        {/*        key={index}*/}
        {/*        initial={{ opacity: 0, x: -20 }}*/}
        {/*        animate={{ opacity: 1, x: 0 }}*/}
        {/*        transition={{ delay: index * 0.1 }}*/}
        {/*        className="flex items-center space-x-3 p-3 bg-black/30 rounded-lg border border-cyan-500/20"*/}
        {/*      >*/}
        {/*        <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>*/}
        {/*        <span className="text-gray-300">{spec}</span>*/}
        {/*      </motion.div>*/}
        {/*    ))}*/}
        {/*  </div>*/}
        {/*</div>*/}

        {/* Image Gallery Placeholder */}
        <div className="mb-6">
          <h3 className="text-cyan-400 font-semibold text-lg mb-3 flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            Gallery
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {product.images.map((image, index) => (
              <div
                key={index}
                className="aspect-video bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg border border-cyan-500/30 flex items-center justify-center"
              >
                <span className="text-cyan-400 text-sm">Image {index + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-6 rounded-lg hover:from-cyan-400 hover:to-blue-400 transition-all"
            onClick={() => {
              router.push(`/3d-demo?modelPath=${encodeURIComponent(product.modelPath)}`);
              onClose();
            }}
          >
            3D Product View
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-400 hover:to-pink-400 transition-all"
            onClick={onClose}
          >
            Close
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
