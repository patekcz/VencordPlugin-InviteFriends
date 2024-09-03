import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, PermissionStore, NavigationRouter, SelectedChannelStore, SelectedGuildStore, Toasts } from "@webpack/common";
import './style.css'; // Importování CSS souboru
import * as DataStore from "@api/DataStore"; // Přidání importu pro DataStore
import { sendMessage, openPrivateChannel } from "@utils/discord"; // Přidání openPrivateChannel
import { findByPropsLazy } from "@webpack";


const InviteActions = findByPropsLazy("createInvite");
const PermissionsBits = findByPropsLazy("MANAGE_CHANNELS", "CREATE_INSTANT_INVITE");

const INVITE_FRIENDS_KEY = "InviteFriendsList"; // Klíč pro ukládání seznamu přátel

const friends: { username: string, id: string, channeldmid: string }[] = []; // Změna na objekt s username a id

let previousChannelId: string | null = null;
let previousGuildId: string | null = null;

function navigateToPreviousChannel() {
    if (previousChannelId && previousGuildId) {
        NavigationRouter.transitionTo(`/channels/${previousGuildId}/${previousChannelId}`);
    }
}

async function loadFriends() {
    const savedFriends = await DataStore.get<{ username: string, id: string, channeldmid: string }[]>(INVITE_FRIENDS_KEY);
    if (savedFriends) {
        friends.push(...savedFriends);
    }
}

async function saveFriends() {
    await DataStore.set(INVITE_FRIENDS_KEY, friends); // Uložení seznamu přátel
}

const VoiceChannelContext: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel || channel.type !== 2) return; // Zkontrolujte, zda je to hlasový kanál

    children.splice(1, 0,
        <Menu.MenuItem
            label="Invite Friends"
            key="invite-friends"
            id="invite-friends"
            className="invite-friends-button"
        >
            {friends.map((friend, index) => (
                <Menu.MenuItem
                    key={`voice-tools-disconnect-${index}`}
                    id={`voice-tools-disconnect-${index}`}
                    label={`Invite ${friend.username}`}
                    className={`user${(index % 19) + 1}`}
                    action={async () => {
                        previousChannelId = SelectedChannelStore.getChannelId(); // Uložení aktuálního kanálu
                        previousGuildId = SelectedGuildStore.getGuildId(); // Uložení aktuálního serveru

                        const canCreateInvite = PermissionStore.can(PermissionsBits.CREATE_INSTANT_INVITE, channel);
                        if (!canCreateInvite) {
                            
                            Toasts.show({
                                message: `You don't have permission to create an invite for ${channel.name}`,
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE
                            });
                            return;
                        }

                        try {
                            const invite = await InviteActions.createInvite(channel.id, {});

                            openPrivateChannel(friend.id); // Otevření soukromého chatu s uživatelem

                            const inviteLink = `https://discord.gg/${invite.code}`;
                            const inviteMessage = getSource(channel.name, inviteLink); // Získání zprávy pozvánky s názvem kanálu a odkazem
                            sendMessage(friend.channeldmid, { content: `${inviteMessage}` });

                            Toasts.show({
                                message: `Invite created for ${channel.name}: ${inviteLink}`,
                                id: Toasts.genId(),
                                type: Toasts.Type.SUCCESS
                            });

                            setTimeout(navigateToPreviousChannel, 3000); // Počkat 3 sekundy a vrátit se na předchozí kanál a server
                        } catch (error) {

                            Toasts.show({
                                message: "Failed to create invite",
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE
                            });
                        }
                    }}
                >
                    {/* implement move logic */}
                </Menu.MenuItem>
            ))}
            <Menu.MenuItem
                label="Clear List"
                key="clear-friends-list"
                id="clear-friends-list"
                className="clear-friends-list-button"
                action={() => {
                    friends.length = 0; // Vyprázdnění seznamu přátel
                    saveFriends(); // Uložení změn

                    Toasts.show({
                        message: "Friends list was cleared",
                        id: Toasts.genId(),
                        type: Toasts.Type.FAILURE,
                    });
                }}
            />
        </Menu.MenuItem>
    );

    // Přesunout tlačítko na druhou pozici, pokud je to nutné
    if (children.length > 2) {
        const item = children.splice(1, 1)[0]; // Odebrání tlačtka
        children.splice(2, 0, item); // Přidání tlačítka na třetí pozici
    }
};

const UserContextMenu: NavContextMenuPatchCallback = (children, { user, channel }) => { // Přidání channel jako parametru
    if (!user) return; // Zkontrolujte, zda je uživatel k dispozici

    const isFriend = friends.some(friend => friend.username === user.username); // Zkontrolujte, zda je uživatel již v seznamu

    // Zobrazit tlačítko pouze v DM
    if (channel && channel.type === 1) { // 1 je typ pro DM kanál
        children.splice(1, 0,
            <Menu.MenuItem
                label={isFriend ? "Remove from invite friends" : "Add to invite friends"}
                key="add-to-invite-friends"
                id="add-to-invite-friends"
                className={isFriend ? "remove-to-invite-friends-button" : "add-to-invite-friends-button"}
                action={() => {
                    if (isFriend) {
                        friends.splice(friends.findIndex(friend => friend.username === user.username), 1); // Odebrání jména uživatele ze seznamu přátel
                       
                        Toasts.show({
                            message: `${user.username} was removed from invite friends`,
                            id: Toasts.genId(),
                            type: Toasts.Type.FAILURE
                        });
                    } else {
                        const channelId = channel.id;
                        navigator.clipboard.writeText(channelId); // Použití správné metody pro kopírování textu do schránky    
                        friends.push({ username: user.username, id: user.id, channeldmid: channel.id }); // Přidání jména uživatele do seznamu přátel
                        
                        Toasts.show({
                            message: `${user.username} was added to invite friends`,
                            id: Toasts.genId(),
                            type: Toasts.Type.SUCCESS
                        });
                    }
                    saveFriends(); // Uložení změn
                }}
            >
            </Menu.MenuItem>
        );
    }

    // Přesunout tlačítko na druhou pozici, pokud je to nutné
    if (children.length > 2) {
        const item = children.splice(1, 1)[0]; // Odebrání tlačítka
        children.splice(2, 0, item); // Přidání tlačítka na třetí pozici
    }
};

// Načtení přátel při inicializaci pluginu
loadFriends();

// const inviteMessage = `User is inviting you to ${channel.name}. Invite link: `;

const settings = definePluginSettings({
    source: {
        description: "Here you can change the invitation text, you can use ${channel.name} and ${inviteLink}",
        type: OptionType.STRING,
        default: "User is inviting you to ${channel.name}. Invite link: ${inviteLink}",
        restartNeeded: true,
    }
});

// Přidání getteru pro získání nastavení
export const getSource = (channelName: string, inviteLink: string) => 
    settings.store.source
        .replace("${channel.name}", channelName)
        .replace("${inviteLink}", inviteLink); // Získání hodnoty nastavení a nahrazení

export default definePlugin({
    name: "InviteFriends",
    description: "This plugin allows invite friends to voice channel",
    authors: [Devs.patekcz],
    settings,

    contextMenus: {
        "channel-context": VoiceChannelContext,
        "user-context": UserContextMenu
    },
});
