module.exports = (db) => {

    return db.define('chart', {
        id:                 {type: 'text', size: 5, key: true, unique: true}, // the auto-incrementing primary key
        title:              {type: 'text', size:255},
        theme:              {type: 'text', size:255},

        author_id:          {type: 'integer'},
        guest_session:      {type: 'text', size: 255},
        organization_id:    {type: 'text', size: 128},
        folder_id:          {type: 'integer', mapsTo: 'in_folder'},

        created_at:         {type: 'date', time: true},
        last_modified_at:   {type: 'date', time: true},
        last_edit_step:     {type: 'integer', size:2},

        published_at:       {type: 'date', time: true},
        public_url:         {type: 'text', size: 255},
        public_version:     {type: 'integer', size: 4},

        deleted:            {type: 'boolean'},
        deleted_at:         {type: 'date', time: true},

        forkable:           {type: 'boolean'},
        is_fork:            {type: 'boolean'},
        forked_from:        {type: 'text', size: 5},

        type:               {type: 'text', size:255},
        metadata:           {type: 'object'},
        language:           {type: 'text', size: 5},
        external_data:      {type: 'text', size: 255},
    }, {
        methods : {
        }
    });
}
