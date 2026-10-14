'use client'
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Cast, Info, Clock, HardDrive, Tag } from 'lucide-react';
import { soundSystem } from '@/utils/soundSystem';

interface Project {
    id: number;
    title: string;
    subtitle: string;
    image: string;
    theme: string;
    duration: string;
    fileSize: string;
    tags: string[];
    description: string;
    audioFreq: number;
    hd?: boolean;
}

interface VideoDetailsModalProps {
    project: Project;
    isOpen: boolean;
    onClose: () => void;
    onPlayOnTV: (project: Project) => void;
    isConnected: boolean;
}

const VideoDetailsModal: React.FC<VideoDetailsModalProps> = ({
    project,
    isOpen,
    onClose,
    onPlayOnTV,
    isConnected
}) => {
    const handlePlayOnTV = () => {
        soundSystem.play('activate');
        onPlayOnTV(project);
        onClose();
    };

    const handleClose = () => {
        soundSystem.play('select');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, rotateY: -15 }}
                        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                        exit={{ scale: 0.8, opacity: 0, rotateY: 15 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative max-w-2xl w-full max-h-[90vh] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(51, 65, 85, 0.95) 100%)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '20px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        }}
                    >
                        {/* Header */}
                        <div className="relative p-6 border-b border-slate-700/50">
                            <div 
                                className="absolute inset-0 opacity-20"
                                style={{ background: project.image }}
                            />
                            <div className="relative z-10">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-1">
                                            {project.title}
                                        </h2>
                                        <p className="text-blue-300 text-lg">
                                            {project.subtitle}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleClose}
                                        className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
                                    >
                                        <X className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                                
                                {project.hd && (
                                    <div className="mt-2">
                                        <span className="px-2 py-1 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                                            HD
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Description */}
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
                                    <Info className="w-5 h-5 mr-2 text-blue-400" />
                                    Description
                                </h3>
                                <p className="text-slate-300 leading-relaxed">
                                    {project.description}
                                </p>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center space-x-2">
                                    <Clock className="w-4 h-4 text-blue-400" />
                                    <span className="text-slate-300">Duration:</span>
                                    <span className="text-white font-medium">{project.duration}</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <HardDrive className="w-4 h-4 text-blue-400" />
                                    <span className="text-slate-300">Size:</span>
                                    <span className="text-white font-medium">{project.fileSize}</span>
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
                                    <Tag className="w-5 h-5 mr-2 text-blue-400" />
                                    Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {project.tags.map((tag, index) => (
                                        <span
                                            key={index}
                                            className="px-3 py-1 text-sm bg-slate-700/50 text-slate-300 rounded-full border border-slate-600/50"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex space-x-4 pt-4">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handlePlayOnTV}
                                    disabled={!isConnected}
                                    className={`flex-1 flex items-center justify-center space-x-2 py-3 px-6 rounded-lg font-semibold transition-all ${
                                        isConnected
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg'
                                            : 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    <Cast className="w-5 h-5" />
                                    <span>
                                        {isConnected ? 'Play on TV' : 'TV Disconnected'}
                                    </span>
                                </motion.button>
                                
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="flex items-center justify-center space-x-2 py-3 px-6 rounded-lg font-semibold bg-slate-700/50 hover:bg-slate-600/50 text-white transition-all"
                                >
                                    <Play className="w-5 h-5" />
                                    <span>Preview</span>
                                </motion.button>
                            </div>
                        </div>

                        {/* Animated border effect */}
                        <div 
                            className="absolute inset-0 rounded-[20px] pointer-events-none"
                            style={{
                                background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.3), transparent)',
                                animation: 'borderScan 3s linear infinite'
                            }}
                        />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default VideoDetailsModal;
