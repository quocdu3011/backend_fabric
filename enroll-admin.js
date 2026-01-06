/**
 * Enroll Admin user from Fabric CA
 * This script enrolls the admin user and saves the identity to wallet
 */

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const { version } = require('os');
const path = require('path');

async function enrollAdmin() {
    try {
        console.log('Enrolling admin from Fabric CA...');
        
        // Create a new CA client for interacting with the CA
        const ca = new FabricCAServices(
            'https://localhost:7054',
            { trustedRoots: '', verify: false },
            'ca-org1'
        );

        // Enroll the admin user
        console.log('Calling CA enroll endpoint...');
        const enrollment = await ca.enroll({ 
            enrollmentID: 'admin', 
            enrollmentSecret: 'adminpw' 
        });
        
        console.log('✓ Successfully enrolled admin from CA');

        // Create wallet directory if it doesn't exist
        const walletPath = path.join(__dirname, 'wallet');
        if (!fs.existsSync(walletPath)) {
            fs.mkdirSync(walletPath, { recursive: true });
        }

        // Use fabric-network Wallet API to save identity
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
            version: 1,
        };
        
        await wallet.put('admin', x509Identity);
        console.log('✓ Saved admin identity to wallet');

        // Also save to admin.id for compatibility
        const adminIdFile = {
            type: 'X.509',
            mspId: 'Org1MSP',
            ou: 'admin',
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            createdAt: new Date().toISOString(),
            version: 1
        };
        
        fs.writeFileSync(
            path.join(walletPath, 'admin.id'),
            JSON.stringify(adminIdFile, null, 2)
        );
        console.log('✓ Saved admin.id file');

        // Update user-store.json
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('adminpw', 10);
        
        const userStore = {
            admin: {
                username: 'admin',
                password: hashedPassword,
                role: 'admin',
                enrollmentSecret: 'adminpw',
                identity: adminIdFile,
                createdAt: new Date().toISOString()
            }
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'user-store.json'),
            JSON.stringify(userStore, null, 2)
        );
        console.log('✓ Updated user-store.json');
        
        console.log('\n✅ Admin enrollment completed successfully!');
        console.log('Certificate sample:', enrollment.certificate.substring(0, 100) + '...');

    } catch (error) {
        console.error(`❌ Failed to enroll admin: ${error.message}`);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

enrollAdmin();
