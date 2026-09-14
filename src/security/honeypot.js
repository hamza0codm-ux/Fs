import {
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    isWhitelisted,
} from '../database/database.js';


/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const TIMEOUT_HONEYPOT_CHANNEL_ID =
    '1547202840785723412';

const BAN_HONEYPOT_CHANNEL_ID =
    '1549109977946259586';

const HONEYPOT_CHANNEL_IDS = [
    TIMEOUT_HONEYPOT_CHANNEL_ID,
    BAN_HONEYPOT_CHANNEL_ID,
];

const HONEYPOT_LOG_CHANNEL_ID =
    '1541557303453683792';

const HONEYPOT_MARKER =
    'fruity-security:honeypot';

const HONEYPOT_TIMEOUT_MS =
    7 * 24 * 60 * 60 * 1000;


/*
|--------------------------------------------------------------------------
| Prevent duplicate event registration
|--------------------------------------------------------------------------
*/

const registeredHoneypotClients =
    new WeakSet();


/*
|--------------------------------------------------------------------------
| Prevent duplicate processing
|--------------------------------------------------------------------------
*/

const usersBeingProcessed =
    new Set();


/*
|--------------------------------------------------------------------------
| Find honeypot channel
|--------------------------------------------------------------------------
*/

export async function findHoneypot(
    guild,
) {
    if (!guild) {
        return null;
    }

    for (const channelId of HONEYPOT_CHANNEL_IDS) {
        let channel =
            guild.channels.cache.get(
                channelId,
            );

        if (channel) {
            return channel;
        }

        try {
            channel =
                await guild.channels.fetch(
                    channelId,
                );

            if (channel) {
                return channel;
            }

        } catch (error) {
            console.error(
                `❌ Failed to fetch honeypot channel ${channelId}:`,
                error,
            );
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Find all honeypot channels
|--------------------------------------------------------------------------
*/

export async function findAllHoneypots(
    guild,
) {
    if (!guild) {
        return [];
    }

    const channels = [];

    for (const channelId of HONEYPOT_CHANNEL_IDS) {
        let channel =
            guild.channels.cache.get(
                channelId,
            );

        if (!channel) {
            try {
                channel =
                    await guild.channels.fetch(
                        channelId,
                    );
            } catch (error) {
                console.error(
                    `❌ Failed to fetch honeypot channel ${channelId}:`,
                    error,
                );

                continue;
            }
        }

        if (channel) {
            channels.push(channel);
        }
    }

    return channels;
}


/*
|--------------------------------------------------------------------------
| Check honeypot channel
|--------------------------------------------------------------------------
*/

export function isHoneypotChannel(
    channel,
) {
    if (!channel) {
        return false;
    }

    return HONEYPOT_CHANNEL_IDS.includes(
        channel.id,
    );
}


/*
|--------------------------------------------------------------------------
| Get honeypot action
|--------------------------------------------------------------------------
*/

function getHoneypotAction(
    channelId,
) {
    if (
        channelId ===
        BAN_HONEYPOT_CHANNEL_ID
    ) {
        return 'ban';
    }

    if (
        channelId ===
        TIMEOUT_HONEYPOT_CHANNEL_ID
    ) {
        return 'timeout';
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Ensure honeypot panels exist
|--------------------------------------------------------------------------
*/

export async function ensureHoneypotPanel(
    guild,
) {
    if (!guild) {
        return null;
    }

    const channels =
        await findAllHoneypots(
            guild,
        );

    if (!channels.length) {
        console.error(
            `❌ No honeypot channels were found in ${guild.name}.`,
        );

        return null;
    }

    for (const channel of channels) {
        if (!channel.isTextBased()) {
            console.error(
                `❌ Honeypot channel ${channel.id} is not a text channel.`,
            );

            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | Add honeypot marker to topic
        |--------------------------------------------------------------------------
        */

        try {
            if (
                typeof channel.setTopic ===
                'function'
            ) {
                const action =
                    getHoneypotAction(
                        channel.id,
                    );

                const expectedTopic =
                    `${HONEYPOT_MARKER} | action=${action}`;

                if (
                    channel.topic !==
                    expectedTopic
                ) {
                    await channel.setTopic(
                        expectedTopic,
                        'Mark Fruity Security honeypot channel',
                    );
                }
            }
        } catch (error) {
            console.error(
                `⚠️ Could not update honeypot channel topic for #${channel.name}:`,
                error,
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Send or update panel
        |--------------------------------------------------------------------------
        */

        await sendHoneypotPanel(
            channel,
        );

        console.log(
            `🍯 Honeypot panel ready in #${channel.name} (${channel.id}).`,
        );
    }

    return channels;
}


/*
|--------------------------------------------------------------------------
| Send honeypot panel
|--------------------------------------------------------------------------
*/

async function sendHoneypotPanel(
    channel,
) {
    try {
        const messages =
            await channel.messages.fetch({
                limit: 50,
            });

        const botUser =
            channel.client?.user;


        /*
        |--------------------------------------------------------------------------
        | Find existing panel
        |--------------------------------------------------------------------------
        */

        const existing =
            botUser
                ? messages.find(
                    (message) =>
                        message.author.id ===
                            botUser.id &&
                        message.embeds.some(
                            (embed) =>
                                embed.title ===
                                    '🍯 Do Not Chat In This Channel' &&
                                embed.description ===
                                    'This channel is **not for chatting**.',
                        ),
                )
                : null;


        /*
        |--------------------------------------------------------------------------
        | Build panel
        |--------------------------------------------------------------------------
        */

        const embed =
            new EmbedBuilder()
                .setTitle(
                    '🍯 Do Not Chat In This Channel',
                )
                .setDescription(
                    'This channel is **not for chatting**.',
                );


        /*
        |--------------------------------------------------------------------------
        | Update existing panel
        |--------------------------------------------------------------------------
        */

        if (existing) {
            await existing.edit({
                embeds: [
                    embed,
                ],
            });

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Send new panel
        |--------------------------------------------------------------------------
        */

        await channel.send({
            embeds: [
                embed,
            ],
        });

    } catch (error) {
        console.error(
            `❌ Failed to send honeypot panel in #${channel.name}:`,
            error,
        );
    }
}


/*
|--------------------------------------------------------------------------
| Start of today
|--------------------------------------------------------------------------
*/

function getStartOfToday() {
    const now =
        new Date();

    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
            0,
        ),
    );
}


/*
|--------------------------------------------------------------------------
| Get message-capable channels
|--------------------------------------------------------------------------
*/

function getMessageChannels(
    guild,
) {
    return [
        ...guild.channels.cache.values(),
    ].filter(
        (channel) =>
            typeof channel.messages?.fetch ===
            'function',
    );
}


/*
|--------------------------------------------------------------------------
| Delete user's messages from one channel
|--------------------------------------------------------------------------
*/

async function deleteUserMessagesFromChannel(
    channel,
    userId,
    startOfToday,
) {
    if (
        !channel.messages ||
        typeof channel.messages.fetch !==
            'function'
    ) {
        return 0;
    }

    let deletedCount = 0;

    let before;


    while (true) {
        let messages;


        /*
        |--------------------------------------------------------------------------
        | Fetch messages
        |--------------------------------------------------------------------------
        */

        try {
            const options = {
                limit: 100,
            };

            if (before) {
                options.before =
                    before;
            }

            messages =
                await channel.messages.fetch(
                    options,
                );

        } catch (error) {
            console.error(
                `❌ Could not read #${channel.name}:`,
                error,
            );

            break;
        }


        if (!messages.size) {
            break;
        }


        /*
        |--------------------------------------------------------------------------
        | Find user's messages from today
        |--------------------------------------------------------------------------
        */

        const userMessages =
            messages.filter(
                (message) =>
                    message.author?.id ===
                        userId &&
                    message.createdTimestamp >=
                        startOfToday.getTime(),
            );


        /*
        |--------------------------------------------------------------------------
        | Delete matching messages
        |--------------------------------------------------------------------------
        */

        if (userMessages.size) {
            const ids =
                [
                    ...userMessages.keys(),
                ];


            /*
            |--------------------------------------------------------------------------
            | Try bulk delete
            |--------------------------------------------------------------------------
            */

            try {
                if (
                    typeof channel.bulkDelete ===
                    'function'
                ) {
                    const deleted =
                        await channel.bulkDelete(
                            ids,
                            true,
                        );

                    deletedCount +=
                        deleted.size;

                } else {
                    /*
                    |--------------------------------------------------------------------------
                    | Individual delete fallback
                    |--------------------------------------------------------------------------
                    */

                    for (const id of ids) {
                        try {
                            await channel.messages.delete(
                                id,
                            );

                            deletedCount++;
                        } catch {
                            // Ignore individual failures.
                        }
                    }
                }

            } catch {
                /*
                |--------------------------------------------------------------------------
                | Bulk delete failed — individual fallback
                |--------------------------------------------------------------------------
                */

                for (const id of ids) {
                    try {
                        await channel.messages.delete(
                            id,
                        );

                        deletedCount++;
                    } catch {
                        // Ignore individual failures.
                    }
                }
            }
        }


        /*
        |--------------------------------------------------------------------------
        | Check whether we reached older messages
        |--------------------------------------------------------------------------
        */

        const hasOlderMessages =
            messages.some(
                (message) =>
                    message.createdTimestamp <
                    startOfToday.getTime(),
            );

        if (hasOlderMessages) {
            break;
        }


        /*
        |--------------------------------------------------------------------------
        | Move backwards through history
        |--------------------------------------------------------------------------
        */

        const oldest =
            messages.last();

        if (!oldest) {
            break;
        }

        before =
            oldest.id;
    }


    return deletedCount;
}


/*
|--------------------------------------------------------------------------
| Delete today's messages across the server
|--------------------------------------------------------------------------
*/

async function deleteUserMessagesFromServer(
    guild,
    userId,
) {
    const startOfToday =
        getStartOfToday();

    const channels =
        getMessageChannels(
            guild,
        );

    let deletedCount = 0;

    let scannedChannels = 0;


    for (const channel of channels) {

        /*
        |--------------------------------------------------------------------------
        | Don't scan honeypot channels
        |--------------------------------------------------------------------------
        */

        if (
            isHoneypotChannel(
                channel,
            )
        ) {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | Don't scan unsupported channels
        |--------------------------------------------------------------------------
        */

        if (
            !channel.isTextBased()
        ) {
            continue;
        }


        try {
            const deleted =
                await deleteUserMessagesFromChannel(
                    channel,
                    userId,
                    startOfToday,
                );

            deletedCount +=
                deleted;

            scannedChannels++;

        } catch (error) {
            console.error(
                `❌ Honeypot cleanup failed in #${channel.name}:`,
                error,
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Small delay between channels
        |--------------------------------------------------------------------------
        */

        await new Promise(
            (resolve) =>
                setTimeout(
                    resolve,
                    150,
                ),
        );
    }


    return {
        deletedCount,
        scannedChannels,
    };
}


/*
|--------------------------------------------------------------------------
| Get log channel
|--------------------------------------------------------------------------
*/

async function getHoneypotLogChannel(
    guild,
) {
    let channel =
        guild.channels.cache.get(
            HONEYPOT_LOG_CHANNEL_ID,
        );


    if (!channel) {
        try {
            channel =
                await guild.channels.fetch(
                    HONEYPOT_LOG_CHANNEL_ID,
                );
        } catch (error) {
            console.error(
                '❌ Failed to fetch honeypot log channel:',
                error,
            );

            return null;
        }
    }


    if (
        !channel ||
        !channel.isTextBased()
    ) {
        console.error(
            `❌ Honeypot log channel ${HONEYPOT_LOG_CHANNEL_ID} is not a text channel.`,
        );

        return null;
    }


    return channel;
}


/*
|--------------------------------------------------------------------------
| Send honeypot log
|--------------------------------------------------------------------------
*/

async function sendHoneypotLog({
    guild,
    member,
    message,
    deletedCount,
    scannedChannels,
    result,
    action,
}) {
    const logChannel =
        await getHoneypotLogChannel(
            guild,
        );


    if (!logChannel) {
        return;
    }


    const trigger =
        message.content
            ? message.content.slice(
                0,
                1024,
            )
            : '[Attachment / no text]';


    const punishment =
        action === 'ban'
            ? '**Permanent Ban**'
            : '**1 Week Timeout**';


    const embed =
        new EmbedBuilder()
            .setTitle(
                '🍯 HONEYPOT TRIGGERED',
            )
            .setDescription(
                `**${member.user.tag}** triggered the Fruity Security honeypot.`,
            )
            .addFields(
                {
                    name: '👤 User',
                    value:
                        `${member}\n\`${member.user.tag}\``,
                    inline: true,
                },
                {
                    name: '🆔 User ID',
                    value:
                        `\`${member.id}\``,
                    inline: true,
                },
                {
                    name: '📍 Triggered In',
                    value:
                        `<#${message.channel.id}>`,
                    inline: true,
                },
                {
                    name: '💬 Trigger',
                    value:
                        trigger,
                    inline: false,
                },
                {
                    name: '🗑️ Deleted Today',
                    value:
                        `**${deletedCount} messages**`,
                    inline: true,
                },
                {
                    name: '📂 Channels Scanned',
                    value:
                        `**${scannedChannels}**`,
                    inline: true,
                },
                {
                    name: '🔨 Punishment',
                    value:
                        punishment,
                    inline: true,
                },
                {
                    name: '📋 Result',
                    value:
                        result.slice(
                            0,
                            1024,
                        ),
                    inline: false,
                },
                {
                    name: '📅 Account Created',
                    value:
                        `<t:${Math.floor(
                            member.user.createdTimestamp /
                            1000,
                        )}:F>`,
                    inline: false,
                },
            )
            .setFooter({
                text:
                    'Fruity Security • Honeypot',
            })
            .setTimestamp();


    try {
        await logChannel.send({
            embeds: [
                embed,
            ],
        });

    } catch (error) {
        console.error(
            '❌ Failed to send honeypot alert:',
            error,
        );
    }
}


/*
|--------------------------------------------------------------------------
| Handle honeypot trigger
|--------------------------------------------------------------------------
*/

export async function handleHoneypotMessage(
    message,
) {
    if (!message?.guild) {
        return;
    }

    if (!message.member) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Only react inside a honeypot
    |--------------------------------------------------------------------------
    */

    if (
        !isHoneypotChannel(
            message.channel,
        )
    ) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Ignore bots
    |--------------------------------------------------------------------------
    */

    if (message.author.bot) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Ignore server owner
    |--------------------------------------------------------------------------
    */

    if (
        message.guild.ownerId ===
        message.author.id
    ) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Ignore Manage Server users
    |--------------------------------------------------------------------------
    */

    if (
        message.member.permissions.has(
            PermissionFlagsBits.ManageGuild,
        )
    ) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Whitelist check
    |--------------------------------------------------------------------------
    */

    try {
        if (
            await isWhitelisted(
                message.guild.id,
                message.author.id,
            )
        ) {
            return;
        }

    } catch (error) {
        console.error(
            '❌ Honeypot whitelist check failed:',
            error,
        );

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Prevent duplicate processing
    |--------------------------------------------------------------------------
    */

    const processingKey =
        `${message.guild.id}:${message.author.id}`;

    if (
        usersBeingProcessed.has(
            processingKey,
        )
    ) {
        console.log(
            `[HONEYPOT] Ignoring duplicate trigger from ${message.author.tag} (${message.author.id}).`,
        );

        return;
    }

    usersBeingProcessed.add(
        processingKey,
    );


    try {

        const action =
            getHoneypotAction(
                message.channel.id,
            );


        /*
        |--------------------------------------------------------------------------
        | Delete trigger message immediately
        |--------------------------------------------------------------------------
        */

        try {
            if (message.deletable) {
                await message.delete();
            }
        } catch (error) {
            console.error(
                '❌ Failed to delete honeypot trigger:',
                error,
            );
        }


        /*
        |--------------------------------------------------------------------------
        | PUNISHMENT
        |--------------------------------------------------------------------------
        */

        let result;


        /*
        |--------------------------------------------------------------------------
        | BAN HONEYPOT
        |--------------------------------------------------------------------------
        */

        if (action === 'ban') {
            try {
                if (
                    message.member.bannable
                ) {
                    await message.member.ban({
                        deleteMessageSeconds: 0,
                        reason:
                            'Fruity Security honeypot triggered',
                    });

                    result =
                        'User was permanently banned from the server.';

                } else {
                    result =
                        'Could not ban the user because the bot cannot moderate them.';
                }

            } catch (error) {
                console.error(
                    '❌ Honeypot ban failed:',
                    error,
                );

                result =
                    `Ban failed: ${
                        error.message ||
                        'Unknown error'
                    }`;
            }
        }


        /*
        |--------------------------------------------------------------------------
        | TIMEOUT HONEYPOT
        |--------------------------------------------------------------------------
        */

        else if (action === 'timeout') {
            try {
                if (
                    message.member.moderatable
                ) {
                    await message.member.timeout(
                        HONEYPOT_TIMEOUT_MS,
                        'Fruity Security honeypot triggered',
                    );

                    result =
                        'User received a 1 week timeout.';

                } else {
                    result =
                        'Could not timeout the user because the bot cannot moderate them.';
                }

            } catch (error) {
                console.error(
                    '❌ Honeypot timeout failed:',
                    error,
                );

                result =
                    `Timeout failed: ${
                        error.message ||
                        'Unknown error'
                    }`;
            }
        }

        else {
            result =
                'No punishment action was configured for this honeypot.';
        }


        /*
        |--------------------------------------------------------------------------
        | NOW delete today's messages
        |--------------------------------------------------------------------------
        */

        let deletedCount = 0;

        let scannedChannels = 0;


        try {
            const cleanup =
                await deleteUserMessagesFromServer(
                    message.guild,
                    message.author.id,
                );

            deletedCount =
                cleanup.deletedCount;

            scannedChannels =
                cleanup.scannedChannels;

        } catch (error) {
            console.error(
                '❌ Server-wide honeypot cleanup failed:',
                error,
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Send log
        |--------------------------------------------------------------------------
        */

        await sendHoneypotLog({
            guild:
                message.guild,

            member:
                message.member,

            message,

            deletedCount,

            scannedChannels,

            result,

            action,
        });


        /*
        |--------------------------------------------------------------------------
        | Console log
        |--------------------------------------------------------------------------
        */

        console.log(
            `[HONEYPOT] ${message.author.tag} (${message.author.id}) triggered ${action} honeypot. ` +
            `${action === 'ban' ? 'Ban' : 'Timeout'} attempted first. ` +
            `Deleted ${deletedCount} messages across ${scannedChannels} channels.`,
        );

    } finally {

        /*
        |--------------------------------------------------------------------------
        | Allow future triggers after processing finishes
        |--------------------------------------------------------------------------
        */

        usersBeingProcessed.delete(
            processingKey,
        );
    }
}


/*
|--------------------------------------------------------------------------
| Register honeypot event
|--------------------------------------------------------------------------
*/

export function registerHoneypotEvents(
    client,
) {
    if (!client) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Prevent duplicate registration
    |--------------------------------------------------------------------------
    */

    if (
        registeredHoneypotClients.has(
            client,
        )
    ) {
        console.log(
            '🍯 Honeypot events already registered. Skipping duplicate registration.',
        );

        return;
    }


    registeredHoneypotClients.add(
        client,
    );


    /*
    |--------------------------------------------------------------------------
    | Message listener
    |--------------------------------------------------------------------------
    */

    client.on(
        'messageCreate',
        async (message) => {
            try {
                await handleHoneypotMessage(
                    message,
                );
            } catch (error) {
                console.error(
                    '❌ Honeypot message handler error:',
                    error,
                );
            }
        },
    );


    console.log(
        `🍯 Honeypot message listener registered for ${HONEYPOT_CHANNEL_IDS.length} channels.`,
    );
}
