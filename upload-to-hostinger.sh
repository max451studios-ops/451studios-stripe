#!/bin/bash
# Upload 451studios.com files to Hostinger
# Run this after making changes to the website

echo "=== Uploading 451studios.com files to Hostinger ==="

# Check for required tools
if ! command -v lftp &> /dev/null; then
    echo "Error: lftp is not installed. Install with: sudo apt-get install lftp"
    exit 1
fi

# Configuration (update these with your Hostinger credentials)
FTP_HOST="ftp.your-domain.com"
FTP_USER="your-username"
FTP_PASS="your-password"
REMOTE_DIR="/public_html"  # or whatever your Hostinger directory is

# Files to upload
FILES=(
    "index.html"
    "success.html"
    "cancel.html"
)

echo "Uploading ${#FILES[@]} files to Hostinger..."

# Upload using lftp
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "Uploading: $file"
        lftp -e "set ftp:ssl-allow no; open -u $FTP_USER,$FTP_PASS $FTP_HOST; cd $REMOTE_DIR; put $file; bye"
        
        if [ $? -eq 0 ]; then
            echo "✓ $file uploaded successfully"
        else
            echo "✗ Failed to upload $file"
        fi
    else
        echo "✗ File not found: $file"
    fi
done

echo ""
echo "=== Upload Complete ==="
echo "Website: https://451studios.com"
echo ""
echo "Next steps:"
echo "1. Visit https://451studios.com to verify changes"
echo "2. Test Stripe buttons (they'll show a setup message)"
echo "3. Create products in Stripe dashboard"
echo "4. Update price IDs in index.html"
echo "5. Deploy backend server (see STRIPE_SETUP.md)"