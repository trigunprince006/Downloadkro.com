let selectedFormat = null;
let currentVideoData = null;
let downloadCheckInterval = null;
const API_BASE_URL = 'http://localhost:8000/api';

// Theme toggle functionality
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const themeIcon = document.getElementById('theme-icon');
    const isDark = document.body.classList.contains('dark-theme');
    themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// FAQ toggle functionality
function toggleFAQ(element) {
    const faqItem = element.parentElement;
    const answer = faqItem.querySelector('.faq-answer');
    
    // Close other FAQs
    document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
            item.classList.remove('active');
            item.querySelector('.faq-answer').classList.remove('active');
        }
    });
    
    // Toggle current FAQ
    faqItem.classList.toggle('active');
    answer.classList.toggle('active');
}

// Enhanced fetch video function with Django API integration
async function fetchVideo() {
    const urlInput = document.getElementById('videoUrl');
    const url = urlInput.value.trim();
    
    if (!url) {
        showNotification('Please enter a video URL', 'error');
        return;
    }
    
    if (!isValidURL(url)) {
        showNotification('Please enter a valid URL', 'error');
        return;
    }
    
    const fetchBtn = document.querySelector('.fetch-btn');
    fetchBtn.classList.add('loading');
    fetchBtn.innerHTML = '<div class="spinner"></div>Fetching...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-video/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentVideoData = data;
            displayVideoPreview(data);
            showNotification('Video information fetched successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to fetch video');
        }
        
    } catch (error) {
        console.error('Fetch error:', error);
        if (error.message.includes('Failed to fetch')) {
            showNotification('Server not reachable. Please make sure the Django server is running on port 8000.', 'error');
        } else {
            showNotification(error.message, 'error');
        }
    } finally {
        fetchBtn.classList.remove('loading');
        fetchBtn.innerHTML = '<i class="fas fa-search"></i> Fetch Video';
    }
}

function displayVideoPreview(videoData) {
    // Update video info
    document.getElementById('videoThumbnail').src = videoData.thumbnail;
    document.getElementById('videoTitle').textContent = videoData.title;
    document.getElementById('videoDuration').textContent = videoData.duration;
    document.getElementById('videoViews').textContent = videoData.views;
    document.getElementById('videoChannel').textContent = videoData.channel;
    document.getElementById('videoDescription').textContent = videoData.description;

    // Create format options
    const formatGrid = document.getElementById('formatGrid');
    formatGrid.innerHTML = '';

    videoData.formats.forEach((format, index) => {
        const formatCard = document.createElement('div');
        formatCard.className = 'format-card';
        formatCard.onclick = () => selectFormat(index, formatCard);
        
        const icon = format.type === 'video' ? 'fas fa-video' : 'fas fa-music';
        const formatLabel = format.type === 'video' ? format.format : 'MP3';
        
        formatCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4><i class="${icon}"></i> ${format.quality}</h4>
                <span style="background: var(--accent-color); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${formatLabel}</span>
            </div>
            <p style="opacity: 0.8;">Size: ${format.size}</p>
            <p style="opacity: 0.6; font-size: 0.9rem;">Click to select this format</p>
        `;
        
        formatGrid.appendChild(formatCard);
    });

    // Show preview
    document.getElementById('videoPreview').style.display = 'block';
    document.getElementById('videoPreview').scrollIntoView({ behavior: 'smooth' });
}

function selectFormat(index, cardElement) {
    // Remove previous selection
    document.querySelectorAll('.format-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select new format
    cardElement.classList.add('selected');
    selectedFormat = index;
    
    // Update download button
    const downloadBtn = document.getElementById('downloadBtn');
    const format = currentVideoData.formats[index];
    const formatName = format.quality + ' ' + (format.type === 'video' ? format.format : 'MP3');
    downloadBtn.innerHTML = `<i class="fas fa-download"></i> Download ${formatName}`;
    downloadBtn.disabled = false;
}

// Enhanced download functionality with progress tracking
async function downloadVideo() {
    if (selectedFormat === null || selectedFormat === undefined) {
        showNotification('Please select a format first', 'warning');
        return;
    }

    const format = currentVideoData.formats[selectedFormat];
    const downloadBtn = document.getElementById('downloadBtn');
    const originalHTML = downloadBtn.innerHTML;
    
    // Show progress
    const progressContainer = createProgressBar();
    downloadBtn.parentElement.insertBefore(progressContainer, downloadBtn.nextSibling);
    
    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting Download...';
    downloadBtn.disabled = true;
    
    try {
        // Start download
        const response = await fetch(`${API_BASE_URL}/download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: currentVideoData.url,
                format_id: format.format_id || 'best',
                quality: format.quality,
                type: format.type,
                ext: format.ext || (format.type === 'audio' ? 'mp3' : 'mp4')
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const downloadId = result.download_id;
            
            // Start progress monitoring
            startProgressMonitoring(downloadId, progressContainer, downloadBtn, originalHTML, format);
            
        } else {
            throw new Error(result.error || 'Download failed');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        downloadBtn.innerHTML = originalHTML;
        downloadBtn.disabled = false;
        progressContainer.remove();
        
        if (error.message.includes('Failed to fetch')) {
            showNotification('Server not reachable. Please make sure the Django server is running.', 'error');
        } else {
            showNotification(`Download failed: ${error.message}`, 'error');
        }
    }
}

function startProgressMonitoring(downloadId, progressContainer, downloadBtn, originalHTML, format) {
    const progressFill = progressContainer.querySelector('.progress-fill');
    const progressText = progressContainer.querySelector('.progress-text');
    
    downloadCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/download-status/${downloadId}/`);
            const statusData = await response.json();
            
            if (response.ok) {
                const progress = statusData.progress || 0;
                const status = statusData.status || 'processing';
                
                progressFill.style.width = progress + '%';
                
                if (status === 'completed') {
                    clearInterval(downloadCheckInterval);
                    progressText.textContent = 'Download complete! Starting file download...';
                    
                    // Download the file
                    if (statusData.download_url) {
                        const downloadLink = document.createElement('a');
                        downloadLink.href = `http://localhost:8000${statusData.download_url}`;
                        downloadLink.download = statusData.filename || 'video';
                        downloadLink.style.display = 'none';
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                    }
                    
                    downloadBtn.innerHTML = '<i class="fas fa-check"></i> Download Complete!';
                    downloadBtn.style.background = '#27ae60';
                    
                    showNotification(`Successfully downloaded ${format.quality}! File size: ${statusData.file_size || 'Unknown'}`, 'success');
                    
                    setTimeout(() => {
                        downloadBtn.innerHTML = originalHTML;
                        downloadBtn.style.background = 'var(--primary-color)';
                        downloadBtn.disabled = false;
                        progressContainer.remove();
                    }, 3000);
                    
                } else if (status === 'failed') {
                    clearInterval(downloadCheckInterval);
                    throw new Error(statusData.error || 'Download failed');
                    
                } else if (status === 'downloading') {
                    progressText.textContent = `Downloading... ${progress}%`;
                    if (statusData.speed) {
                        progressText.textContent += ` (${statusData.speed})`;
                    }
                } else {
                    progressText.textContent = 'Processing...';
                }
                
            } else {
                throw new Error('Failed to get download status');
            }
            
        } catch (error) {
            clearInterval(downloadCheckInterval);
            console.error('Status check error:', error);
            
            downloadBtn.innerHTML = originalHTML;
            downloadBtn.disabled = false;
            progressContainer.remove();
            
            showNotification(`Download failed: ${error.message}`, 'error');
        }
    }, 2000); // Check every 2 seconds
}

// Helper functions
function createProgressBar() {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <div class="progress-text">Initializing download...</div>
    `;
    
    // Add progress bar styles if not exists
    if (!document.querySelector('#progress-styles')) {
        const style = document.createElement('style');
        style.id = 'progress-styles';
        style.textContent = `
            .progress-container {
                margin: 1rem 0;
                text-align: center;
            }
            .progress-bar {
                width: 100%;
                height: 8px;
                background: #e0e0e0;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 0.5rem;
            }
            .progress-fill {
                height: 100%;
                background: var(--gradient);
                width: 0%;
                transition: width 0.3s ease;
            }
            .progress-text {
                font-size: 0.9rem;
                color: var(--accent-color);
            }
            .dark-theme .progress-bar {
                background: #555;
            }
        `;
        document.head.appendChild(style);
    }
    
    return progressContainer;
}

function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        ${message}
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; margin-left: 10px; cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add notification styles if not exists
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: 400px;
                animation: slideIn 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                font-size: 14px;
                line-height: 1.4;
            }
            .notification.info { background: var(--accent-color); }
            .notification.error { background: #e74c3c; }
            .notification.warning { background: #f39c12; }
            .notification.success { background: #27ae60; }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .notification button {
                transition: opacity 0.2s ease;
            }
            .notification button:hover {
                opacity: 0.7;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
    
    // Add slide out animation
    if (!document.querySelector('#slideout-styles')) {
        const style = document.createElement('style');
        style.id = 'slideout-styles';
        style.textContent = `
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Add smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add Enter key support for URL input
document.getElementById('videoUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        fetchVideo();
    }
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + V to focus URL input (for easier pasting)
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const urlInput = document.getElementById('videoUrl');
        if (document.activeElement !== urlInput) {
            urlInput.focus();
        }
    }
    
    // ESC to clear input and hide preview
    if (e.key === 'Escape') {
        document.getElementById('videoUrl').value = '';
        document.getElementById('videoPreview').style.display = 'none';
        selectedFormat = null;
        currentVideoData = null;
        if (downloadCheckInterval) {
            clearInterval(downloadCheckInterval);
        }
    }
});

// Check server status on page load
window.addEventListener('load', async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/health/`);
        if (response.ok) {
            console.log('Django backend server is running');
            showNotification('Server connected successfully!', 'success');
        } else {
            throw new Error('Server health check failed');
        }
    } catch (error) {
        console.warn('Django backend server is not reachable:', error);
        showNotification('Backend server is not running. Please start the Django server to use download functionality.', 'warning');
    }
});

// Copy to clipboard functionality
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Copied to clipboard!', 'success');
        }).catch(() => {
            showNotification('Failed to copy to clipboard', 'error');
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showNotification('Copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textArea);
    }
}